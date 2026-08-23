// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary,
    toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {HookDataCodec} from "./libraries/HookDataCodec.sol";
import {RoundMath} from "./libraries/RoundMath.sol";

contract OvertimeHook is BaseHook, IUnlockCallback, ReentrancyGuard {
    using CurrencyLibrary for Currency;
    using PoolIdLibrary for PoolKey;
    using SafeCast for uint256;

    uint24 public constant LP_FEE = 0;
    int24 public constant TICK_SPACING = 200;
    uint160 public constant INITIAL_SQRT_PRICE_X96 = 792281625142643375935439503360000;
    uint256 public constant MIN_GROSS_WETH = 1_000;
    uint256 public constant MIN_CHALLENGE_WETH = 0.01 ether;
    uint64 public constant INITIAL_SOFT_CLOCK = 15 minutes;
    uint64 public constant RESPONSE_WINDOW = 5 minutes;
    uint64 public constant HARD_CLOCK = 60 minutes;
    uint160 public constant REQUIRED_PERMISSION_MASK = 0x20cc;

    bytes32 private constant FEE_SLOT = keccak256("overtime.hook.swap.fee");
    bytes32 private constant CROWN_SLOT = keccak256("overtime.hook.swap.crown");
    bytes32 private constant CORE_WETH_SLOT = keccak256("overtime.hook.swap.core-weth");

    struct ActiveRound {
        uint64 start;
        uint64 softEnd;
        uint64 hardEnd;
        uint64 leaderSince;
        uint64 leaderCrownedBlock;
        address leader;
        uint256 activePot;
        uint256 leaderContribution;
        uint256 totalCrownSeconds;
    }

    struct FinalizedRound {
        bool finalized;
        bool decision;
        address champion;
        uint256 championPool;
        uint256 crownTimePool;
        uint256 totalCrownSeconds;
    }

    error AccountingMismatch(uint256 categorized, uint256 conserved);
    error AlreadyClaimed();
    error ChallengeDeadlinePassed();
    error ChallengeOutputTooLow(uint256 actual, uint256 minimum);
    error ChallengeSettlementMismatch(uint256 expected, uint256 actual);
    error InvalidChallengeAmount();
    error InvalidChallengeDirection();
    error InvalidChallengePlayer();
    error InvalidChallengeRouter();
    error InvalidInitializer();
    error InvalidPool();
    error InvalidWethAmount(uint256 amount);
    error NoActiveExpiredRound();
    error NoEntitlement();
    error NotChampion();
    error NotFinalized();
    error OnlyPoolManager();
    error SolvencyShortfall(uint256 backing, uint256 liabilities);
    error ZeroAddress();

    event GameFeeAccrued(
        PoolId indexed poolId,
        address indexed swapSender,
        bool indexed wethToOvertime,
        uint256 grossWeth,
        uint256 gameFee,
        uint256 nextRemainder
    );
    event RoundStarted(
        uint256 indexed roundId,
        address indexed leader,
        uint64 start,
        uint64 softEnd,
        uint64 hardEnd,
        uint256 crownCost,
        uint256 activePot
    );
    event CrownChanged(
        uint256 indexed roundId,
        address indexed previousLeader,
        address indexed newLeader,
        uint64 changedAt,
        uint64 softEnd,
        uint256 crownCost
    );
    event SameBlockRefundCredited(uint256 indexed roundId, address indexed beneficiary, uint256 amount);
    event RoundFinalized(
        uint256 indexed roundId,
        bool indexed decision,
        address indexed champion,
        uint256 championPool,
        uint256 crownTimePool,
        uint256 rollover,
        uint256 totalCrownSeconds
    );
    event ChampionRewardClaimed(uint256 indexed roundId, address indexed champion, uint256 amount);
    event CrownTimeRewardClaimed(uint256 indexed roundId, address indexed holder, uint256 amount);
    event RefundClaimed(address indexed beneficiary, uint256 amount);

    address public immutable weth;
    address public immutable overtimeToken;
    address public immutable challengeRouter;
    address public immutable launcher;
    PoolId public immutable canonicalPoolId;

    uint256 public latestRoundId;
    ActiveRound private _currentRound;
    mapping(uint256 roundId => FinalizedRound round) private _finalizedRounds;
    mapping(uint256 roundId => mapping(address holder => uint256 secondsHeld)) public crownSeconds;
    mapping(uint256 roundId => mapping(address holder => bool claimed)) public crownTimeClaimed;
    mapping(uint256 roundId => bool claimed) public championClaimed;
    mapping(address beneficiary => uint256 amount) public refundCredit;

    uint256 public pendingPot;
    uint256 public totalChampionLiability;
    uint256 public totalCrownTimeLiability;
    uint256 public totalRefundLiability;
    uint256 public totalWethTaken;
    uint256 public totalWethClaimed;
    uint256 public totalChampionClaimed;
    uint256 public totalCrownTimeClaimed;
    uint256 public totalRefundClaimed;
    uint256 public gameFeeRemainder;

    constructor(
        IPoolManager manager,
        address weth_,
        address overtimeToken_,
        address challengeRouter_,
        address launcher_
    ) BaseHook(manager) {
        if (
            address(manager) == address(0) || weth_ == address(0) || overtimeToken_ == address(0)
                || challengeRouter_ == address(0) || launcher_ == address(0)
        ) revert ZeroAddress();
        if (weth_ >= overtimeToken_) revert InvalidPool();

        weth = weth_;
        overtimeToken = overtimeToken_;
        challengeRouter = challengeRouter_;
        launcher = launcher_;
        canonicalPoolId = canonicalPoolKey().toId();
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function canonicalPoolKey() public view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(weth),
            currency1: Currency.wrap(overtimeToken),
            fee: LP_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(this))
        });
    }

    function previewChallenge(uint256 grossWeth)
        external
        view
        returns (uint256 gameFee, uint256 crown, uint256 totalWeth)
    {
        _validatePositiveGross(grossWeth);
        if (grossWeth < MIN_CHALLENGE_WETH) revert InvalidChallengeAmount();
        (gameFee,) = RoundMath.gameFee(grossWeth, gameFeeRemainder);

        uint256 potAfterFee;
        ActiveRound memory round = _currentRound;
        if (round.leader == address(0)) {
            potAfterFee = pendingPot + gameFee;
        } else if (block.timestamp >= round.softEnd) {
            (,, uint256 rollover) = RoundMath.distribution(round.activePot, round.softEnd == round.hardEnd);
            potAfterFee = pendingPot + rollover + gameFee;
        } else {
            uint256 refundable = round.leaderCrownedBlock == block.number ? round.leaderContribution : 0;
            potAfterFee = round.activePot - refundable + gameFee;
        }
        crown = RoundMath.crownCost(potAfterFee);
        totalWeth = grossWeth + crown;
    }

    function finalizeExpiredRound() external nonReentrant {
        if (!_roundExpired()) revert NoActiveExpiredRound();
        _finalizeRound();
        _assertAccounting();
    }

    function claimChampionReward(uint256 roundId) external nonReentrant {
        FinalizedRound storage round = _finalizedRounds[roundId];
        if (!round.finalized) revert NotFinalized();
        if (msg.sender != round.champion) revert NotChampion();
        if (championClaimed[roundId]) revert AlreadyClaimed();
        uint256 amount = round.championPool;
        if (amount == 0) revert NoEntitlement();

        championClaimed[roundId] = true;
        totalChampionLiability -= amount;
        totalChampionClaimed += amount;
        _redeem(msg.sender, amount);
        emit ChampionRewardClaimed(roundId, msg.sender, amount);
    }

    function claimCrownTimeReward(uint256 roundId) external nonReentrant {
        FinalizedRound storage round = _finalizedRounds[roundId];
        if (!round.finalized) revert NotFinalized();
        if (crownTimeClaimed[roundId][msg.sender]) revert AlreadyClaimed();
        uint256 amount =
            RoundMath.proRata(round.crownTimePool, crownSeconds[roundId][msg.sender], round.totalCrownSeconds);
        if (amount == 0) revert NoEntitlement();

        crownTimeClaimed[roundId][msg.sender] = true;
        totalCrownTimeLiability -= amount;
        totalCrownTimeClaimed += amount;
        _redeem(msg.sender, amount);
        emit CrownTimeRewardClaimed(roundId, msg.sender, amount);
    }

    function claimRefund() external nonReentrant {
        uint256 amount = refundCredit[msg.sender];
        if (amount == 0) revert NoEntitlement();
        refundCredit[msg.sender] = 0;
        totalRefundLiability -= amount;
        totalRefundClaimed += amount;
        _redeem(msg.sender, amount);
        emit RefundClaimed(msg.sender, amount);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        (address recipient, uint256 amount) = abi.decode(data, (address, uint256));
        uint256 wethId = Currency.wrap(weth).toId();
        poolManager.burn(address(this), wethId, amount);
        poolManager.take(Currency.wrap(weth), recipient, amount);
        return bytes("");
    }

    function unclaimedLiabilities() public view returns (uint256) {
        return
            pendingPot + _currentRound.activePot + totalChampionLiability + totalCrownTimeLiability
                + totalRefundLiability;
    }

    function currentRound() external view returns (ActiveRound memory) {
        return _currentRound;
    }

    function finalizedRounds(uint256 roundId) external view returns (FinalizedRound memory) {
        return _finalizedRounds[roundId];
    }

    function claimBacking() public view returns (uint256) {
        return poolManager.balanceOf(address(this), Currency.wrap(weth).toId());
    }

    function _beforeInitialize(address sender, PoolKey calldata key, uint160) internal view override returns (bytes4) {
        _validatePool(key);
        if (sender != launcher) revert InvalidInitializer();
        return BaseHook.beforeInitialize.selector;
    }

    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        _validatePool(key);
        if (_roundExpired()) _finalizeRound();

        if (hookData.length != 0) return _beforeChallenge(sender, params, hookData);
        if (_wethIsSpecified(params)) return _beforeSpecifiedWethSwap(sender, params);
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function _afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        _validatePool(key);

        uint256 fee;
        uint256 crown = 0;
        int128 returnedUnspecifiedDelta = 0;
        if (_wethIsSpecified(params)) {
            fee = _tload(FEE_SLOT);
            crown = _tload(CROWN_SLOT);
            uint256 expectedCoreWeth = _tload(CORE_WETH_SLOT);
            _clearSwapContext();
            uint256 actualCoreWeth = params.zeroForOne ? _negative(delta.amount0()) : _positive(delta.amount0());
            if (actualCoreWeth != expectedCoreWeth) {
                revert ChallengeSettlementMismatch(expectedCoreWeth, actualCoreWeth);
            }
        } else {
            uint256 grossWeth;
            if (params.zeroForOne) {
                uint256 coreInput = _negative(delta.amount0());
                uint256 nextRemainder;
                (grossWeth, fee, nextRemainder) = RoundMath.grossUp(coreInput, gameFeeRemainder);
                _validatePositiveGross(grossWeth);
                gameFeeRemainder = nextRemainder;
            } else {
                grossWeth = _positive(delta.amount0());
                (fee, gameFeeRemainder) = _feeForGross(grossWeth);
            }
            _recordOrdinaryFee(fee);
            totalWethTaken += fee;
            emit GameFeeAccrued(canonicalPoolId, sender, params.zeroForOne, grossWeth, fee, gameFeeRemainder);
            returnedUnspecifiedDelta = fee.toInt128();
        }

        if (hookData.length != 0) {
            HookDataCodec.ChallengeIntent memory intent = HookDataCodec.decodeChallenge(hookData);
            uint256 output = _positive(delta.amount1());
            if (output < intent.minTokenOut) revert ChallengeOutputTooLow(output, intent.minTokenOut);
        }

        uint256 claims = fee + crown;
        if (claims != 0) poolManager.mint(address(this), Currency.wrap(weth).toId(), claims);
        _assertAccounting();
        return (BaseHook.afterSwap.selector, returnedUnspecifiedDelta);
    }

    function _beforeChallenge(address sender, SwapParams calldata params, bytes calldata hookData)
        private
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (sender != challengeRouter) revert InvalidChallengeRouter();
        if (!params.zeroForOne || params.amountSpecified >= 0) revert InvalidChallengeDirection();
        HookDataCodec.ChallengeIntent memory intent = HookDataCodec.decodeChallenge(hookData);
        if (intent.player == address(0)) revert InvalidChallengePlayer();
        if (block.timestamp > intent.deadline) revert ChallengeDeadlinePassed();

        uint256 grossWeth = uint256(-params.amountSpecified);
        if (intent.expectedGrossWeth != grossWeth) revert InvalidChallengeAmount();
        _validatePositiveGross(grossWeth);
        if (grossWeth < MIN_CHALLENGE_WETH) revert InvalidChallengeAmount();

        (uint256 fee, uint256 nextRemainder) = RoundMath.gameFee(grossWeth, gameFeeRemainder);
        gameFeeRemainder = nextRemainder;
        uint256 crown = _applyChallenge(intent.player, fee);
        totalWethTaken += fee + crown;
        _storeSwapContext(fee, crown, grossWeth - fee);
        emit GameFeeAccrued(canonicalPoolId, sender, true, grossWeth, fee, nextRemainder);
        return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(fee.toInt128(), 0), 0);
    }

    function _beforeSpecifiedWethSwap(address sender, SwapParams calldata params)
        private
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        uint256 grossWeth;
        uint256 fee;
        uint256 nextRemainder;
        uint256 expectedCoreWeth;

        if (params.amountSpecified < 0) {
            grossWeth = uint256(-params.amountSpecified);
            (fee, nextRemainder) = _feeForGross(grossWeth);
            expectedCoreWeth = grossWeth - fee;
        } else {
            uint256 requestedNet = uint256(params.amountSpecified);
            (grossWeth, fee, nextRemainder) = RoundMath.grossUp(requestedNet, gameFeeRemainder);
            _validatePositiveGross(grossWeth);
            gameFeeRemainder = nextRemainder;
            expectedCoreWeth = grossWeth;
        }

        _recordOrdinaryFee(fee);
        totalWethTaken += fee;
        _storeSwapContext(fee, 0, expectedCoreWeth);
        emit GameFeeAccrued(canonicalPoolId, sender, params.zeroForOne, grossWeth, fee, nextRemainder);
        return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(fee.toInt128(), 0), 0);
    }

    function _applyChallenge(address player, uint256 fee) private returns (uint256 crown) {
        ActiveRound storage round = _currentRound;
        if (round.leader == address(0)) {
            uint256 initialPotAfterFee = pendingPot + fee;
            crown = RoundMath.crownCost(initialPotAfterFee);
            uint64 start = uint64(block.timestamp);
            uint64 softEnd = start + INITIAL_SOFT_CLOCK;
            uint64 hardEnd = start + HARD_CLOCK;
            ++latestRoundId;
            _currentRound = ActiveRound({
                start: start,
                softEnd: softEnd,
                hardEnd: hardEnd,
                leaderSince: start,
                leaderCrownedBlock: uint64(block.number),
                leader: player,
                activePot: initialPotAfterFee + crown,
                leaderContribution: crown,
                totalCrownSeconds: 0
            });
            pendingPot = 0;
            emit RoundStarted(latestRoundId, player, start, softEnd, hardEnd, crown, initialPotAfterFee + crown);
            return crown;
        }

        address previousLeader = round.leader;
        _closeLeaderInterval(block.timestamp);
        if (round.leaderCrownedBlock == block.number) {
            uint256 refundable = round.leaderContribution;
            round.activePot -= refundable;
            refundCredit[previousLeader] += refundable;
            totalRefundLiability += refundable;
            emit SameBlockRefundCredited(latestRoundId, previousLeader, refundable);
        }

        uint256 potAfterFee = round.activePot + fee;
        crown = RoundMath.crownCost(potAfterFee);
        round.activePot = potAfterFee + crown;
        round.leader = player;
        round.leaderSince = uint64(block.timestamp);
        round.leaderCrownedBlock = uint64(block.number);
        round.leaderContribution = crown;

        uint64 candidate = uint64(block.timestamp) + RESPONSE_WINDOW;
        if (candidate > round.softEnd) round.softEnd = candidate > round.hardEnd ? round.hardEnd : candidate;
        emit CrownChanged(latestRoundId, previousLeader, player, uint64(block.timestamp), round.softEnd, crown);
    }

    function _recordOrdinaryFee(uint256 fee) private {
        if (_currentRound.leader == address(0)) pendingPot += fee;
        else _currentRound.activePot += fee;
    }

    function _finalizeRound() private {
        _closeLeaderInterval(_currentRound.softEnd);
        ActiveRound memory round = _currentRound;
        uint256 totalSeconds = round.totalCrownSeconds;
        bool decision = round.softEnd == round.hardEnd;
        (uint256 championPool, uint256 crownTimePool, uint256 rollover) =
            RoundMath.distribution(round.activePot, decision);

        _finalizedRounds[latestRoundId] = FinalizedRound({
            finalized: true,
            decision: decision,
            champion: round.leader,
            championPool: championPool,
            crownTimePool: crownTimePool,
            totalCrownSeconds: totalSeconds
        });
        totalChampionLiability += championPool;
        totalCrownTimeLiability += crownTimePool;
        pendingPot += rollover;
        delete _currentRound;
        emit RoundFinalized(latestRoundId, decision, round.leader, championPool, crownTimePool, rollover, totalSeconds);
    }

    function _closeLeaderInterval(uint256 intervalEnd) private {
        ActiveRound storage round = _currentRound;
        uint256 elapsed = intervalEnd - round.leaderSince;
        if (elapsed != 0) {
            crownSeconds[latestRoundId][round.leader] += elapsed;
            round.totalCrownSeconds += elapsed;
        }
        round.leaderSince = uint64(intervalEnd);
    }

    function _redeem(address recipient, uint256 amount) private {
        totalWethClaimed += amount;
        poolManager.unlock(abi.encode(recipient, amount));
        _assertAccounting();
    }

    function _feeForGross(uint256 grossWeth) private returns (uint256 fee, uint256 nextRemainder) {
        _validatePositiveGross(grossWeth);
        (fee, nextRemainder) = RoundMath.gameFee(grossWeth, gameFeeRemainder);
        gameFeeRemainder = nextRemainder;
    }

    function _validatePositiveGross(uint256 grossWeth) private pure {
        if (grossWeth != 0 && grossWeth < MIN_GROSS_WETH) revert InvalidWethAmount(grossWeth);
        if (grossWeth >= 1 << 127) revert InvalidWethAmount(grossWeth);
    }

    function _validatePool(PoolKey calldata key) private view {
        if (
            Currency.unwrap(key.currency0) != weth || Currency.unwrap(key.currency1) != overtimeToken
                || key.fee != LP_FEE || key.tickSpacing != TICK_SPACING || address(key.hooks) != address(this)
                || PoolId.unwrap(key.toId()) != PoolId.unwrap(canonicalPoolId)
        ) revert InvalidPool();
    }

    function _wethIsSpecified(SwapParams calldata params) private pure returns (bool) {
        return (params.amountSpecified < 0 && params.zeroForOne) || (params.amountSpecified > 0 && !params.zeroForOne);
    }

    function _roundExpired() private view returns (bool) {
        return _currentRound.leader != address(0) && block.timestamp >= _currentRound.softEnd;
    }

    function _assertAccounting() private view {
        uint256 liabilities = unclaimedLiabilities();
        uint256 conserved = totalWethTaken - totalWethClaimed;
        if (liabilities != conserved) revert AccountingMismatch(liabilities, conserved);
        uint256 backing = claimBacking();
        if (backing < liabilities) revert SolvencyShortfall(backing, liabilities);
    }

    function _storeSwapContext(uint256 fee, uint256 crown, uint256 coreWeth) private {
        bytes32 feeSlot = FEE_SLOT;
        bytes32 crownSlot = CROWN_SLOT;
        bytes32 coreWethSlot = CORE_WETH_SLOT;
        assembly ("memory-safe") {
            tstore(feeSlot, fee)
            tstore(crownSlot, crown)
            tstore(coreWethSlot, coreWeth)
        }
    }

    function _clearSwapContext() private {
        bytes32 feeSlot = FEE_SLOT;
        bytes32 crownSlot = CROWN_SLOT;
        bytes32 coreWethSlot = CORE_WETH_SLOT;
        assembly ("memory-safe") {
            tstore(feeSlot, 0)
            tstore(crownSlot, 0)
            tstore(coreWethSlot, 0)
        }
    }

    function _tload(bytes32 slot) private view returns (uint256 value) {
        assembly ("memory-safe") {
            value := tload(slot)
        }
    }

    function _positive(int128 value) private pure returns (uint256) {
        if (value < 0) revert InvalidChallengeDirection();
        return uint256(uint128(value));
    }

    function _negative(int128 value) private pure returns (uint256) {
        if (value > 0) revert InvalidChallengeDirection();
        return uint256(-int256(value));
    }
}
