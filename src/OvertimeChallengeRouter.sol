// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IUnlockCallback } from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";

import { HookDataCodec } from "./HookDataCodec.sol";

interface IOvertimeChallengeHook {
    function previewChallenge(uint256 grossWeth)
        external
        view
        returns (uint256 totalWethRequired, uint256 crownCost, uint256 totalFee);
}

/// @title Overtime Challenge Router
/// @notice The sole authenticated challenge entry point. Payer, player, beneficiary, and recipient are msg.sender.
/// @dev This router has no approvals, arbitrary call target, retained authority, or asset withdrawal surface.
contract OvertimeChallengeRouter is IUnlockCallback, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using SafeCast for int256;
    using SafeCast for uint256;

    struct CallbackData {
        address player;
        PoolKey key;
        uint256 totalWethRequired;
        uint256 minTokenOut;
        SwapParams params;
        bytes hookData;
    }

    IPoolManager public immutable poolManager;
    address public immutable weth;

    error ChallengeDeadlineExpired(uint256 deadline, uint256 timestamp);
    error InputDeltaMismatch(int128 actual, uint256 expected);
    error InvalidChallengePool();
    error NotPoolManager(address caller);
    error OutputDeltaInvalid(int128 actual);
    error OutputBelowMinimum(uint256 actual, uint256 minimum);
    error UnexpectedUnlockResult();
    error ZeroAddress();

    event ChallengeExecuted(
        address indexed player,
        address indexed hook,
        uint256 grossWeth,
        uint256 crownCost,
        uint256 fee,
        uint256 tokenOut
    );

    constructor(IPoolManager poolManager_, address weth_) {
        if (address(poolManager_) == address(0) || weth_ == address(0)) revert ZeroAddress();
        poolManager = poolManager_;
        weth = weth_;
    }

    function challenge(
        PoolKey calldata key,
        uint256 grossWeth,
        uint256 minTokenOut,
        uint256 deadline,
        uint160 sqrtPriceLimitX96
    ) external nonReentrant returns (uint256 tokenOut) {
        if (deadline < block.timestamp) revert ChallengeDeadlineExpired(deadline, block.timestamp);
        if (
            Currency.unwrap(key.currency0) != weth || Currency.unwrap(key.currency1) == address(0)
                || address(key.hooks) == address(0)
        ) revert InvalidChallengePool();

        (uint256 totalWethRequired, uint256 crownCost, uint256 fee) =
            IOvertimeChallengeHook(address(key.hooks)).previewChallenge(grossWeth);
        IERC20(weth).safeTransferFrom(msg.sender, address(this), totalWethRequired);

        HookDataCodec.Challenge memory intent = HookDataCodec.Challenge({
            player: msg.sender, expectedGrossWeth: grossWeth, minTokenOut: minTokenOut, deadline: deadline
        });
        bytes memory hookData = HookDataCodec.encode(intent);
        SwapParams memory params = SwapParams({
            zeroForOne: true, amountSpecified: -totalWethRequired.toInt256(), sqrtPriceLimitX96: sqrtPriceLimitX96
        });
        CallbackData memory callbackData = CallbackData({
            player: msg.sender,
            key: key,
            totalWethRequired: totalWethRequired,
            minTokenOut: minTokenOut,
            params: params,
            hookData: hookData
        });
        bytes memory result = poolManager.unlock(abi.encode(callbackData));
        if (result.length != 32) revert UnexpectedUnlockResult();
        tokenOut = abi.decode(result, (uint256));
        emit ChallengeExecuted(msg.sender, address(key.hooks), grossWeth, crownCost, fee, tokenOut);
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager(msg.sender);
        CallbackData memory data = abi.decode(rawData, (CallbackData));
        BalanceDelta delta = poolManager.swap(data.key, data.params, data.hookData);
        if (delta.amount0() != -data.totalWethRequired.toInt256().toInt128()) {
            revert InputDeltaMismatch(delta.amount0(), data.totalWethRequired);
        }
        if (delta.amount1() <= 0) revert OutputDeltaInvalid(delta.amount1());
        uint256 tokenOut = int256(delta.amount1()).toUint256();
        if (tokenOut < data.minTokenOut) revert OutputBelowMinimum(tokenOut, data.minTokenOut);

        poolManager.sync(data.key.currency0);
        IERC20(weth).safeTransfer(address(poolManager), data.totalWethRequired);
        uint256 settled = poolManager.settle();
        if (settled != data.totalWethRequired) revert InputDeltaMismatch(delta.amount0(), settled);
        poolManager.take(data.key.currency1, data.player, tokenOut);
        return abi.encode(tokenOut);
    }
}
