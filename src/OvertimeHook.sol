// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { SignedMath } from "@openzeppelin/contracts/utils/math/SignedMath.sol";
import { BaseHook } from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import { CurrencySettler } from "@openzeppelin/uniswap-hooks/src/utils/CurrencySettler.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IUnlockCallback } from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import { FullMath } from "@uniswap/v4-core/src/libraries/FullMath.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary,
    toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";

import { HookDataCodec } from "./HookDataCodec.sol";
import { IOvertimeChallengeHook } from "./OvertimeChallengeRouter.sol";
import { RoundMath } from "./RoundMath.sol";

/// @title Overtime v1
/// @notice One-pool WETH fee hook and recurring crown-time game.
/// @dev This revision first establishes the production-compatible fee kernel. Game transitions are added without
/// changing the immutable fee constants or the four-quadrant settlement paths.
contract OvertimeHook is BaseHook, IUnlockCallback, IOvertimeChallengeHook, ReentrancyGuardTransient {
    using BeforeSwapDeltaLibrary for BeforeSwapDelta;
    using CurrencySettler for Currency;
    using PoolIdLibrary for PoolKey;
    using SafeCast for *;

    struct ActiveRound {
        bool active;
        uint64 start;
        uint64 softEnd;
        uint64 hardEnd;
        uint64 leaderSince;
        address leader;
        uint256 activePot;
        uint256 currentCrownContribution;
        uint256 totalCrownSeconds;
    }

    uint256 public constant RATE_DENOMINATOR = 1_000_000;
    uint32 public constant PROGRAMMABLE_HUNDREDTHS_OF_BIP = 1000;
    uint32 public constant GAME_HUNDREDTHS_OF_BIP = 10_000;
    uint32 public constant TOTAL_HUNDREDTHS_OF_BIP = 11_000;
    uint256 public constant MIN_GROSS_QUOTE_AMOUNT = 1000;
    uint256 public constant MIN_CHALLENGE_GROSS_WETH = 0.01 ether;
    address public constant PROGRAMMABLE_FEE_OWNER = 0x4957f49620AFf3Adbbe8195a4f633E49cc93376c;

    uint24 public constant CANONICAL_LP_FEE = 0;
    int24 public constant CANONICAL_TICK_SPACING = 200;
    bytes4 private constant CLAIM_UNLOCK_MAGIC = bytes4(keccak256("OVERTIME_V1_PROGRAMMABLE_CLAIM"));

    address public immutable weth;
    address public immutable token;
    address public immutable challengeRouter;
    address public immutable initializer;
    bytes32 public immutable canonicalPoolId;

    uint256 public totalGrossQuoteVolume;
    uint256 public totalFeesAccrued;
    uint256 public totalWethTaken;
    uint256 public totalWethClaimed;
    uint256 public programmableFeeLiability;
    uint256 public pendingPot;
    uint256 public claimedProgrammableFees;
    uint256 public claimedChampionRewards;
    uint256 public claimedCrownTimeRewards;
    uint256 public claimedRefunds;
    uint256 public programmableFeeRemainder;
    uint256 public gameFeeRemainder;

    uint256 public roundId = 0;
    ActiveRound public currentRound;
    uint256 public totalChampionLiability;
    uint256 public totalCrownTimeLiability;
    uint256 public totalRefundLiability;
    mapping(uint256 id => address champion) public roundChampion;
    mapping(uint256 id => uint256 amount) public championPool;
    mapping(uint256 id => uint256 amount) public crownTimePool;
    mapping(uint256 id => uint256 seconds_) public finalizedCrownSeconds;
    mapping(uint256 id => bool decision) public roundWasDecision;
    mapping(uint256 id => mapping(address holder => uint256 seconds_)) public crownSeconds;
    mapping(uint256 id => mapping(address holder => bool claimed)) public crownTimeClaimed;
    mapping(address beneficiary => uint256 amount) public refundCredit;

    uint256 private _pendingSpecifiedQuotePoolAmountPlusOne;
    address private _pendingChallengePlayer;
    uint256 private _pendingChallengeMinimumTokenOut;

    error CurrenciesOutOfOrder(address currency0, address currency1);
    error ExactOutputRoundingUnsupported(uint256 netQuoteAmount);
    error ChallengeAmountMismatch(uint256 actual, uint256 expected);
    error ChallengeDeadlineExpired(uint256 deadline, uint256 timestamp);
    error ChallengeGrossBelowMinimum(uint256 actual, uint256 minimum);
    error ChallengePartialFill(uint256 actualTokenOut, uint256 minimumTokenOut);
    error ChallengeSenderUnauthorized(address actual, address expected);
    error ChallengeSwapModeUnsupported();
    error CrownTimeAlreadyClaimed(uint256 round, address holder);
    error Insolvent(uint256 backing, uint256 liabilities);
    error InvalidHook(address actual, address expected);
    error InvalidPoolShape();
    error NoFeesToClaim();
    error NoRewardToClaim();
    error PartialFillUnsupported(uint256 expectedQuotePoolAmount, uint256 actualQuotePoolAmount);
    error PendingSpecifiedQuoteCallback();
    error QuoteAmountBelowFeeQuantum(uint256 grossQuoteAmount, uint256 minimumGrossQuoteAmount);
    error UnauthorizedClaim(address caller, address expected);
    error UnexpectedPool(bytes32 actual, bytes32 expected);
    error UnexpectedUnlockData();
    error UnexpectedUnlockResult();
    error UnauthorizedInitializer(address caller, address expected);
    error ZeroAddress();

    event OvertimeSwapFeeAccrued(
        bytes32 indexed poolId,
        address indexed swapSender,
        bool indexed isBuy,
        uint256 grossQuoteAmount,
        uint256 gameFee,
        uint256 programmableFee,
        uint256 gameRemainder,
        uint256 programmableRemainder
    );
    event ProgrammableFeesClaimed(address indexed owner, address indexed recipient, uint256 amount);
    event RoundStarted(
        uint256 indexed round,
        address indexed leader,
        uint64 start,
        uint64 softEnd,
        uint64 hardEnd,
        uint256 activePot,
        uint256 crownContribution
    );
    event CrownChanged(
        uint256 indexed round,
        address indexed previousLeader,
        address indexed newLeader,
        uint64 timestamp,
        uint64 softEnd,
        uint256 crownContribution
    );
    event SameBlockRefundCredited(uint256 indexed round, address indexed beneficiary, uint256 amount);
    event RoundFinalized(
        uint256 indexed round,
        address indexed champion,
        bool decision,
        uint64 terminalTimestamp,
        uint256 pot,
        uint256 championAmount,
        uint256 crownTimeAmount,
        uint256 rolloverAmount,
        uint256 crownSeconds
    );
    event ChampionRewardClaimed(uint256 indexed round, address indexed beneficiary, uint256 amount);
    event CrownTimeRewardClaimed(
        uint256 indexed round, address indexed beneficiary, uint256 secondsHeld, uint256 amount
    );
    event RefundClaimed(address indexed beneficiary, uint256 amount);

    constructor(
        IPoolManager poolManager_,
        address weth_,
        address token_,
        address challengeRouter_,
        address initializer_
    ) BaseHook(poolManager_) {
        if (
            address(poolManager_) == address(0) || weth_ == address(0) || token_ == address(0)
                || challengeRouter_ == address(0) || initializer_ == address(0)
        ) revert ZeroAddress();
        if (weth_ >= token_) revert CurrenciesOutOfOrder(weth_, token_);

        weth = weth_;
        token = token_;
        challengeRouter = challengeRouter_;
        initializer = initializer_;
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(weth_),
            currency1: Currency.wrap(token_),
            fee: CANONICAL_LP_FEE,
            tickSpacing: CANONICAL_TICK_SPACING,
            hooks: IHooks(address(this))
        });
        canonicalPoolId = PoolId.unwrap(key.toId());
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory permissions) {
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

    function _beforeInitialize(address sender, PoolKey calldata key, uint160) internal view override returns (bytes4) {
        _requireCanonicalPool(key);
        if (sender != initializer) revert UnauthorizedInitializer(sender, initializer);
        return IHooks.beforeInitialize.selector;
    }

    function canonicalPoolKey() external view returns (PoolKey memory key) {
        key = PoolKey({
            currency0: Currency.wrap(weth),
            currency1: Currency.wrap(token),
            fee: CANONICAL_LP_FEE,
            tickSpacing: CANONICAL_TICK_SPACING,
            hooks: IHooks(address(this))
        });
    }

    function quoteGrossFees(uint256 grossQuoteAmount)
        external
        view
        returns (uint256 totalFee, uint256 gameFee, uint256 programmableFee)
    {
        (totalFee, gameFee, programmableFee,,) = _feesForGross(grossQuoteAmount);
    }

    function quoteExactOutputFees(uint256 netQuoteAmount)
        external
        view
        returns (uint256 grossQuoteAmount, uint256 totalFee, uint256 gameFee, uint256 programmableFee)
    {
        (grossQuoteAmount, totalFee, gameFee, programmableFee,,) = _feesForNet(netQuoteAmount);
    }

    function previewChallenge(uint256 grossWeth)
        external
        view
        returns (uint256 totalWethRequired, uint256 crownCost, uint256 totalFee)
    {
        uint256 gameFee;
        (totalFee, gameFee,,,) = _feesForGross(grossWeth);
        uint256 pot;
        ActiveRound memory round = currentRound;
        if (round.active && block.timestamp >= round.softEnd) {
            RoundMath.Distribution memory split = RoundMath.distribute(round.activePot, round.softEnd == round.hardEnd);
            pot = pendingPot + split.rollover + gameFee;
        } else if (round.active) {
            pot = round.activePot + gameFee;
            if (round.leaderSince == block.timestamp) pot -= round.currentCrownContribution;
        } else {
            pot = pendingPot + gameFee;
        }
        crownCost = RoundMath.crownCost(pot);
        totalWethRequired = grossWeth + crownCost;
    }

    function totalUnclaimedLiabilities() public view returns (uint256) {
        return programmableFeeLiability + pendingPot + currentRound.activePot + totalChampionLiability
            + totalCrownTimeLiability + totalRefundLiability;
    }

    function solvencyStatus() external view returns (uint256 backing, uint256 liabilities, bool solvent) {
        backing = poolManager.balanceOf(address(this), uint256(uint160(weth)));
        liabilities = totalUnclaimedLiabilities();
        solvent = backing >= liabilities;
    }

    function availableCrownTimeReward(uint256 id, address holder) external view returns (uint256) {
        if (crownTimeClaimed[id][holder]) return 0;
        return RoundMath.crownTimeReward(crownTimePool[id], crownSeconds[id][holder], finalizedCrownSeconds[id]);
    }

    function isRoundExpired() public view returns (bool) {
        return currentRound.active && block.timestamp >= currentRound.softEnd;
    }

    function finalizeExpiredRound() external returns (bool finalized) {
        finalized = _finalizeExpiredRound();
    }

    function claimProgrammableFees(address recipient) external nonReentrant returns (uint256 amount) {
        if (msg.sender != PROGRAMMABLE_FEE_OWNER) revert UnauthorizedClaim(msg.sender, PROGRAMMABLE_FEE_OWNER);
        if (recipient == address(0)) revert ZeroAddress();
        amount = programmableFeeLiability;
        if (amount == 0) revert NoFeesToClaim();

        programmableFeeLiability = 0;
        claimedProgrammableFees += amount;
        totalWethClaimed += amount;
        _assertLiabilityConservation();
        _redeemQuote(recipient, amount);
        emit ProgrammableFeesClaimed(msg.sender, recipient, amount);
    }

    function claimChampionReward(uint256 id) external nonReentrant returns (uint256 amount) {
        if (roundChampion[id] != msg.sender) revert NoRewardToClaim();
        amount = championPool[id];
        if (amount == 0) revert NoRewardToClaim();
        championPool[id] = 0;
        totalChampionLiability -= amount;
        claimedChampionRewards += amount;
        totalWethClaimed += amount;
        _assertLiabilityConservation();
        _redeemQuote(msg.sender, amount);
        emit ChampionRewardClaimed(id, msg.sender, amount);
    }

    function claimCrownTimeReward(uint256 id) external nonReentrant returns (uint256 amount) {
        if (crownTimeClaimed[id][msg.sender]) revert CrownTimeAlreadyClaimed(id, msg.sender);
        uint256 secondsHeld = crownSeconds[id][msg.sender];
        amount = RoundMath.crownTimeReward(crownTimePool[id], secondsHeld, finalizedCrownSeconds[id]);
        if (amount == 0) revert NoRewardToClaim();
        crownTimeClaimed[id][msg.sender] = true;
        totalCrownTimeLiability -= amount;
        claimedCrownTimeRewards += amount;
        totalWethClaimed += amount;
        _assertLiabilityConservation();
        _redeemQuote(msg.sender, amount);
        emit CrownTimeRewardClaimed(id, msg.sender, secondsHeld, amount);
    }

    function claimRefund() external nonReentrant returns (uint256 amount) {
        amount = refundCredit[msg.sender];
        if (amount == 0) revert NoRewardToClaim();
        refundCredit[msg.sender] = 0;
        totalRefundLiability -= amount;
        claimedRefunds += amount;
        totalWethClaimed += amount;
        _assertLiabilityConservation();
        _redeemQuote(msg.sender, amount);
        emit RefundClaimed(msg.sender, amount);
    }

    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        _requireCanonicalPool(key);
        _finalizeExpiredRound();

        if (hookData.length != 0) return _beforeChallenge(sender, params, hookData);

        bool exactInput = params.amountSpecified < 0;
        bool quoteIsSpecified = params.zeroForOne == exactInput;
        if (!quoteIsSpecified) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        uint256 quoteAmount = _absolute(params.amountSpecified);
        if (_pendingSpecifiedQuotePoolAmountPlusOne != 0) revert PendingSpecifiedQuoteCallback();
        uint256 totalFee = _chargeQuote(sender, params.zeroForOne, quoteAmount, !exactInput);
        uint256 expectedQuotePoolAmount = exactInput ? quoteAmount - totalFee : quoteAmount + totalFee;
        _pendingSpecifiedQuotePoolAmountPlusOne = expectedQuotePoolAmount + 1;
        if (totalFee == 0) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(totalFee.toInt256().toInt128(), 0), 0);
    }

    function _afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        _requireCanonicalPool(key);
        bool challenge = hookData.length != 0;
        if (challenge) {
            if (sender != challengeRouter) revert ChallengeSenderUnauthorized(sender, challengeRouter);
            HookDataCodec.Challenge memory intent = HookDataCodec.decode(hookData);
            if (intent.player != _pendingChallengePlayer) {
                revert ChallengeSenderUnauthorized(intent.player, _pendingChallengePlayer);
            }
        }

        bool exactInput = params.amountSpecified < 0;
        bool quoteIsSpecified = params.zeroForOne == exactInput;
        if (quoteIsSpecified) {
            uint256 pendingPlusOne = _pendingSpecifiedQuotePoolAmountPlusOne;
            if (pendingPlusOne == 0) revert PendingSpecifiedQuoteCallback();
            uint256 expectedQuotePoolAmount = pendingPlusOne - 1;
            _pendingSpecifiedQuotePoolAmountPlusOne = 0;
            uint256 actualQuotePoolAmount = _absolute(delta.amount0());
            if (actualQuotePoolAmount != expectedQuotePoolAmount) {
                revert PartialFillUnsupported(expectedQuotePoolAmount, actualQuotePoolAmount);
            }
            if (challenge) {
                uint256 tokenOut = _absolute(delta.amount1());
                if (tokenOut < _pendingChallengeMinimumTokenOut) {
                    revert ChallengePartialFill(tokenOut, _pendingChallengeMinimumTokenOut);
                }
                _pendingChallengePlayer = address(0);
                _pendingChallengeMinimumTokenOut = 0;
            }
            return (IHooks.afterSwap.selector, 0);
        }

        if (challenge) revert ChallengeSwapModeUnsupported();

        uint256 executedQuoteAmount = _absolute(delta.amount0());
        uint256 executedTotalFee = _chargeQuote(sender, params.zeroForOne, executedQuoteAmount, !exactInput);
        if (executedTotalFee == 0) return (IHooks.afterSwap.selector, 0);
        return (IHooks.afterSwap.selector, executedTotalFee.toInt256().toInt128());
    }

    function _beforeChallenge(address sender, SwapParams calldata params, bytes calldata hookData)
        private
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (sender != challengeRouter) revert ChallengeSenderUnauthorized(sender, challengeRouter);
        if (!params.zeroForOne || params.amountSpecified >= 0) revert ChallengeSwapModeUnsupported();
        HookDataCodec.Challenge memory intent = HookDataCodec.decode(hookData);
        if (intent.deadline < block.timestamp) revert ChallengeDeadlineExpired(intent.deadline, block.timestamp);
        if (intent.expectedGrossWeth < MIN_CHALLENGE_GROSS_WETH) {
            revert ChallengeGrossBelowMinimum(intent.expectedGrossWeth, MIN_CHALLENGE_GROSS_WETH);
        }

        (uint256 totalFee, uint256 gameFee,,,) = _feesForGross(intent.expectedGrossWeth);
        uint256 pot = currentRound.active ? currentRound.activePot + gameFee : pendingPot + gameFee;
        if (currentRound.active && currentRound.leaderSince == block.timestamp) {
            pot -= currentRound.currentCrownContribution;
        }
        uint256 crownCost = RoundMath.crownCost(pot);
        uint256 actualSpecified = _absolute(params.amountSpecified);
        uint256 expectedSpecified = intent.expectedGrossWeth + crownCost;
        if (actualSpecified != expectedSpecified) revert ChallengeAmountMismatch(actualSpecified, expectedSpecified);
        if (_pendingSpecifiedQuotePoolAmountPlusOne != 0 || _pendingChallengePlayer != address(0)) {
            revert PendingSpecifiedQuoteCallback();
        }

        uint256 chargedFee = _chargeQuote(sender, true, intent.expectedGrossWeth, false);
        assert(chargedFee == totalFee);
        _takeCrown(intent.player, crownCost);
        uint256 expectedQuotePoolAmount = intent.expectedGrossWeth - totalFee;
        _pendingSpecifiedQuotePoolAmountPlusOne = expectedQuotePoolAmount + 1;
        _pendingChallengePlayer = intent.player;
        _pendingChallengeMinimumTokenOut = intent.minTokenOut;

        uint256 hookAmount = totalFee + crownCost;
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(hookAmount.toInt256().toInt128(), 0), 0);
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (bytes4 magic, address recipient, uint256 amount) = abi.decode(data, (bytes4, address, uint256));
        if (magic != CLAIM_UNLOCK_MAGIC || recipient == address(0) || amount == 0) revert UnexpectedUnlockData();

        Currency quote = Currency.wrap(weth);
        quote.settle(poolManager, address(this), amount, true);
        quote.take(poolManager, recipient, amount, false);
        return "";
    }

    function _chargeQuote(address sender, bool isBuy, uint256 quoteAmount, bool amountIsNet)
        private
        returns (uint256 totalFee)
    {
        uint256 grossQuoteAmount;
        uint256 gameFee;
        uint256 programmableFee;
        uint256 nextGameRemainder;
        uint256 nextProgrammableRemainder;
        if (amountIsNet) {
            (grossQuoteAmount, totalFee, gameFee, programmableFee, nextGameRemainder, nextProgrammableRemainder) =
                _feesForNet(quoteAmount);
        } else {
            grossQuoteAmount = quoteAmount;
            (totalFee, gameFee, programmableFee, nextGameRemainder, nextProgrammableRemainder) =
                _feesForGross(grossQuoteAmount);
        }
        if (grossQuoteAmount == 0) return 0;

        gameFeeRemainder = nextGameRemainder;
        programmableFeeRemainder = nextProgrammableRemainder;
        if (currentRound.active) currentRound.activePot += gameFee;
        else pendingPot += gameFee;
        programmableFeeLiability += programmableFee;
        totalGrossQuoteVolume += grossQuoteAmount;
        totalFeesAccrued += totalFee;
        totalWethTaken += totalFee;
        _assertLiabilityConservation();

        emit OvertimeSwapFeeAccrued(
            canonicalPoolId,
            sender,
            isBuy,
            grossQuoteAmount,
            gameFee,
            programmableFee,
            nextGameRemainder,
            nextProgrammableRemainder
        );
        if (totalFee != 0) Currency.wrap(weth).take(poolManager, address(this), totalFee, true);
    }

    function _takeCrown(address player, uint256 crownCost) private {
        uint64 timestamp = block.timestamp.toUint64();
        if (!currentRound.active) {
            unchecked {
                ++roundId;
            }
            (uint64 softEnd, uint64 hardEnd) = RoundMath.initialDeadlines(timestamp);
            currentRound = ActiveRound({
                active: true,
                start: timestamp,
                softEnd: softEnd,
                hardEnd: hardEnd,
                leaderSince: timestamp,
                leader: player,
                activePot: pendingPot,
                currentCrownContribution: crownCost,
                totalCrownSeconds: 0
            });
            pendingPot = 0;
            currentRound.activePot += crownCost;
            emit RoundStarted(roundId, player, timestamp, softEnd, hardEnd, currentRound.activePot, crownCost);
        } else {
            address previousLeader = currentRound.leader;
            _closeLeaderInterval(timestamp);
            if (currentRound.leaderSince == timestamp) {
                uint256 refund = currentRound.currentCrownContribution;
                currentRound.activePot -= refund;
                refundCredit[previousLeader] += refund;
                totalRefundLiability += refund;
                emit SameBlockRefundCredited(roundId, previousLeader, refund);
            }
            currentRound.activePot += crownCost;
            currentRound.leader = player;
            currentRound.leaderSince = timestamp;
            currentRound.currentCrownContribution = crownCost;
            currentRound.softEnd = RoundMath.extendSoftEnd(currentRound.softEnd, currentRound.hardEnd, timestamp);
            emit CrownChanged(roundId, previousLeader, player, timestamp, currentRound.softEnd, crownCost);
        }

        totalWethTaken += crownCost;
        Currency.wrap(weth).take(poolManager, address(this), crownCost, true);
        _assertLiabilityConservation();
    }

    function _finalizeExpiredRound() private returns (bool finalized) {
        if (!currentRound.active || block.timestamp < currentRound.softEnd) return false;
        uint64 terminalTimestamp = currentRound.softEnd;
        _closeLeaderInterval(terminalTimestamp);
        bool decision = currentRound.softEnd == currentRound.hardEnd;
        RoundMath.Distribution memory split = RoundMath.distribute(currentRound.activePot, decision);
        uint256 id = roundId;

        roundChampion[id] = currentRound.leader;
        championPool[id] = split.champion;
        crownTimePool[id] = split.crownTime;
        finalizedCrownSeconds[id] = currentRound.totalCrownSeconds;
        roundWasDecision[id] = decision;
        totalChampionLiability += split.champion;
        totalCrownTimeLiability += split.crownTime;
        pendingPot += split.rollover;

        emit RoundFinalized(
            id,
            currentRound.leader,
            decision,
            terminalTimestamp,
            currentRound.activePot,
            split.champion,
            split.crownTime,
            split.rollover,
            currentRound.totalCrownSeconds
        );
        delete currentRound;
        _assertLiabilityConservation();
        return true;
    }

    function _closeLeaderInterval(uint64 timestamp) private {
        uint256 elapsed = timestamp - currentRound.leaderSince;
        if (elapsed == 0) return;
        crownSeconds[roundId][currentRound.leader] += elapsed;
        currentRound.totalCrownSeconds += elapsed;
    }

    function _assertLiabilityConservation() private view {
        uint256 liabilities = totalUnclaimedLiabilities();
        uint256 expected = totalWethTaken - totalWethClaimed;
        if (liabilities != expected) revert Insolvent(expected, liabilities);
    }

    function _feesForGross(uint256 grossQuoteAmount)
        private
        view
        returns (
            uint256 totalFee,
            uint256 gameFee,
            uint256 programmableFee,
            uint256 nextGameRemainder,
            uint256 nextProgrammableRemainder
        )
    {
        if (grossQuoteAmount != 0 && grossQuoteAmount < MIN_GROSS_QUOTE_AMOUNT) {
            revert QuoteAmountBelowFeeQuantum(grossQuoteAmount, MIN_GROSS_QUOTE_AMOUNT);
        }
        (programmableFee, nextProgrammableRemainder) =
            _accumulateRate(grossQuoteAmount, PROGRAMMABLE_HUNDREDTHS_OF_BIP, programmableFeeRemainder);
        (gameFee, nextGameRemainder) = _accumulateRate(grossQuoteAmount, GAME_HUNDREDTHS_OF_BIP, gameFeeRemainder);
        totalFee = gameFee + programmableFee;
    }

    function _feesForNet(uint256 netQuoteAmount)
        private
        view
        returns (
            uint256 grossQuoteAmount,
            uint256 totalFee,
            uint256 gameFee,
            uint256 programmableFee,
            uint256 nextGameRemainder,
            uint256 nextProgrammableRemainder
        )
    {
        if (netQuoteAmount == 0) {
            return (0, 0, 0, 0, gameFeeRemainder, programmableFeeRemainder);
        }

        uint256 estimate =
            FullMath.mulDivRoundingUp(netQuoteAmount, RATE_DENOMINATOR, RATE_DENOMINATOR - TOTAL_HUNDREDTHS_OF_BIP);
        uint256 candidate = estimate > 8 ? estimate - 8 : MIN_GROSS_QUOTE_AMOUNT;
        if (candidate < MIN_GROSS_QUOTE_AMOUNT) candidate = MIN_GROSS_QUOTE_AMOUNT;
        for (uint256 index; index < 17; ++index) {
            (
                uint256 candidateTotal,
                uint256 candidateGame,
                uint256 candidateProgrammable,
                uint256 candidateGameRemainder,
                uint256 candidateProgrammableRemainder
            ) = _feesForGross(candidate);
            if (candidateTotal <= candidate && candidate - candidateTotal == netQuoteAmount) {
                return (
                    candidate,
                    candidateTotal,
                    candidateGame,
                    candidateProgrammable,
                    candidateGameRemainder,
                    candidateProgrammableRemainder
                );
            }
            ++candidate;
        }
        revert ExactOutputRoundingUnsupported(netQuoteAmount);
    }

    function _accumulateRate(uint256 grossQuoteAmount, uint32 rate, uint256 carriedRemainder)
        private
        pure
        returns (uint256 fee, uint256 nextRemainder)
    {
        fee = FullMath.mulDiv(grossQuoteAmount, rate, RATE_DENOMINATOR);
        uint256 fractional = mulmod(grossQuoteAmount, rate, RATE_DENOMINATOR);
        uint256 combinedRemainder = fractional + carriedRemainder;
        fee += combinedRemainder / RATE_DENOMINATOR;
        nextRemainder = combinedRemainder % RATE_DENOMINATOR;
    }

    function _redeemQuote(address recipient, uint256 amount) private {
        bytes memory result = poolManager.unlock(abi.encode(CLAIM_UNLOCK_MAGIC, recipient, amount));
        if (result.length != 0) revert UnexpectedUnlockResult();
    }

    function _requireCanonicalPool(PoolKey calldata key) private view {
        if (
            Currency.unwrap(key.currency0) != weth || Currency.unwrap(key.currency1) != token
                || key.fee != CANONICAL_LP_FEE || key.tickSpacing != CANONICAL_TICK_SPACING
        ) revert InvalidPoolShape();
        if (address(key.hooks) != address(this)) revert InvalidHook(address(key.hooks), address(this));
        bytes32 poolId = PoolId.unwrap(key.toId());
        if (poolId != canonicalPoolId) revert UnexpectedPool(poolId, canonicalPoolId);
    }

    function _absolute(int256 value) private pure returns (uint256) {
        return SignedMath.abs(value);
    }
}
