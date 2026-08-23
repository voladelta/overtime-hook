// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {OvertimeHook} from "../OvertimeHook.sol";
import {HookDataCodec} from "../libraries/HookDataCodec.sol";

contract OvertimeChallengeRouter is IUnlockCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct ChallengeRequest {
        address player;
        uint256 grossWeth;
        uint256 minTokenOut;
        uint256 deadline;
        uint160 sqrtPriceLimitX96;
        uint256 crownCost;
    }

    error AlreadyBound();
    error ChallengeSettlementMismatch(uint256 expected, uint256 actual);
    error InvalidAddress();
    error InvalidAmount();
    error InvalidOutput();
    error NotBound();
    error OnlyBinder();
    error OnlyPoolManager();

    event OvertimeChallengeRouterBound(address indexed overtimeToken, address indexed hook);
    event OvertimeChallengeExecuted(
        address indexed player, uint256 grossWeth, uint256 crownCost, uint256 overtimeOut, uint256 deadline
    );

    IPoolManager public immutable poolManager;
    IERC20 public immutable weth;
    address public immutable binder;

    OvertimeHook public hook;
    IERC20 public overtimeToken;
    bool public bound;

    constructor(IPoolManager manager, IERC20 weth_, address binder_) {
        if (address(manager) == address(0) || address(weth_) == address(0) || binder_ == address(0)) {
            revert InvalidAddress();
        }
        poolManager = manager;
        weth = weth_;
        binder = binder_;
    }

    function bind(IERC20 overtimeToken_, OvertimeHook hook_) external {
        if (msg.sender != binder) revert OnlyBinder();
        if (bound) revert AlreadyBound();
        if (address(overtimeToken_) == address(0) || address(hook_) == address(0)) revert InvalidAddress();
        if (hook_.challengeRouter() != address(this) || hook_.overtimeToken() != address(overtimeToken_)) {
            revert InvalidAddress();
        }
        overtimeToken = overtimeToken_;
        hook = hook_;
        bound = true;
        emit OvertimeChallengeRouterBound(address(overtimeToken_), address(hook_));
    }

    function poolKey() public view returns (PoolKey memory) {
        if (!bound) revert NotBound();
        return PoolKey({
            currency0: Currency.wrap(address(weth)),
            currency1: Currency.wrap(address(overtimeToken)),
            fee: hook.LP_FEE(),
            tickSpacing: hook.TICK_SPACING(),
            hooks: IHooks(address(hook))
        });
    }

    function challenge(uint256 grossWeth, uint256 minTokenOut, uint256 deadline, uint160 sqrtPriceLimitX96)
        external
        nonReentrant
        returns (uint256 overtimeOut)
    {
        if (!bound) revert NotBound();
        if (grossWeth == 0 || grossWeth >= 1 << 127) revert InvalidAmount();
        (, uint256 crownCost,) = hook.previewChallenge(grossWeth);

        ChallengeRequest memory request = ChallengeRequest({
            player: msg.sender,
            grossWeth: grossWeth,
            minTokenOut: minTokenOut,
            deadline: deadline,
            sqrtPriceLimitX96: sqrtPriceLimitX96,
            crownCost: crownCost
        });
        overtimeOut = abi.decode(poolManager.unlock(abi.encode(request)), (uint256));
        emit OvertimeChallengeExecuted(msg.sender, grossWeth, crownCost, overtimeOut, deadline);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        ChallengeRequest memory request = abi.decode(data, (ChallengeRequest));
        bytes memory hookData =
            HookDataCodec.encodeChallenge(request.player, request.grossWeth, request.minTokenOut, request.deadline);
        BalanceDelta delta = poolManager.swap(
            poolKey(),
            SwapParams({
                zeroForOne: true,
                amountSpecified: -int256(request.grossWeth),
                sqrtPriceLimitX96: request.sqrtPriceLimitX96
            }),
            hookData
        );

        uint256 wethDebt = _negative(delta.amount0());
        uint256 overtimeOut = _positive(delta.amount1());
        if (wethDebt != request.grossWeth) revert ChallengeSettlementMismatch(request.grossWeth, wethDebt);
        if (overtimeOut < request.minTokenOut) revert InvalidOutput();

        _settleFor(address(this), request.player, request.grossWeth);
        _settleFor(address(hook), request.player, request.crownCost);
        poolManager.take(Currency.wrap(address(overtimeToken)), request.player, overtimeOut);
        return abi.encode(overtimeOut);
    }

    function _settleFor(address recipient, address payer, uint256 amount) private {
        if (amount == 0) return;
        Currency wethCurrency = Currency.wrap(address(weth));
        poolManager.sync(wethCurrency);
        // `payer` is request.player, which challenge() fixes to msg.sender before this router starts the unlock.
        // PoolManager always calls back the contract that initiated that unlock.
        // slither-disable-next-line arbitrary-send-erc20
        weth.safeTransferFrom(payer, address(poolManager), amount);
        uint256 settled = recipient == address(this) ? poolManager.settle() : poolManager.settleFor(recipient);
        if (settled != amount) revert ChallengeSettlementMismatch(amount, settled);
    }

    function _positive(int128 value) private pure returns (uint256) {
        if (value < 0) revert InvalidOutput();
        return uint256(uint128(value));
    }

    function _negative(int128 value) private pure returns (uint256) {
        if (value > 0) revert InvalidAmount();
        return uint256(-int256(value));
    }
}
