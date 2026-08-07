// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { PositionPlanner } from "@uniswap/liquidity-launcher/src/libraries/PositionPlanner.sol";
import {
    CurrencyAmounts,
    Plan,
    Position,
    PositionDefinition
} from "@uniswap/liquidity-launcher/src/types/PositionPlannerTypes.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { IPositionManager } from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import { LockedLiquidityVault } from "./LockedLiquidityVault.sol";
import { OvertimeHook } from "./OvertimeHook.sol";
import { OvertimeToken } from "./OvertimeToken.sol";

/// @title Overtime Launcher
/// @notice Atomic or gas-bounded two-phase deployment and launch, with authenticated initialization and permanent LP
/// custody.
contract OvertimeLauncher is ReentrancyGuardTransient {
    using PoolIdLibrary for PoolKey;
    using SafeERC20 for IERC20;

    uint160 public constant REQUIRED_HOOK_FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG
        | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;
    uint160 public constant INITIAL_SQRT_PRICE_X96 = 792_281_625_142_643_375_935_439_503_360_000;
    uint256 public constant WETH_LIQUIDITY_BUDGET = 10 ether;

    struct LaunchResult {
        address token;
        address hook;
        address vault;
        uint256 positionTokenId;
        uint256 wethLiquidity;
        uint256 tokenLiquidity;
        bytes32 poolId;
    }

    IPoolManager public immutable poolManager;
    IPositionManager public immutable positionManager;
    address public immutable weth;
    address public immutable challengeRouter;
    address public immutable launchAuthority;
    bytes32 public immutable tokenCreationCodeHash;
    bytes32 public immutable hookCreationCodeHash;

    bool public launched;
    bool public assetsDeployed;
    OvertimeToken public overtimeToken;
    OvertimeHook public overtimeHook;
    LaunchResult public launchResult;

    error AlreadyLaunched();
    error AssetsAlreadyDeployed();
    error AssetsNotDeployed();
    error HookAddressFlagsInvalid(address hook, uint160 actual, uint160 required);
    error InvalidCreationCode(bytes32 actual, bytes32 expected);
    error InvalidInitialPrice(uint160 sqrtPriceX96);
    error InvalidInitialTick(int24 actual, int24 expected);
    error InvalidPositionManager(address expectedPoolManager, address actualPoolManager);
    error InvalidTokenOrdering(address weth, address token);
    error InvalidWethLiquidityBudget(uint256 actual, uint256 expected);
    error LaunchUnauthorized(address caller, address expected);
    error LiquidityTransferMismatch(address token, uint256 expected, uint256 actual);
    error PositionNotLocked(uint256 tokenId, address actualOwner, address expectedOwner);
    error UnexpectedPositionCount(uint256 count);
    error ZeroAddress();

    event OvertimeLaunched(
        address indexed token,
        address indexed hook,
        address indexed vault,
        uint256 positionTokenId,
        bytes32 poolId,
        uint256 wethLiquidity,
        uint256 tokenLiquidity,
        uint160 initialSqrtPriceX96
    );
    event OvertimeAssetsDeployed(address indexed token, address indexed hook);

    constructor(
        IPoolManager poolManager_,
        IPositionManager positionManager_,
        address weth_,
        address challengeRouter_,
        address launchAuthority_,
        bytes32 tokenCreationCodeHash_,
        bytes32 hookCreationCodeHash_
    ) {
        if (
            address(poolManager_) == address(0) || address(positionManager_) == address(0) || weth_ == address(0)
                || challengeRouter_ == address(0) || launchAuthority_ == address(0)
        ) revert ZeroAddress();
        if (tokenCreationCodeHash_ == bytes32(0) || hookCreationCodeHash_ == bytes32(0)) {
            revert InvalidCreationCode(0, 0);
        }
        address actualPoolManager = address(positionManager_.poolManager());
        if (actualPoolManager != address(poolManager_)) {
            revert InvalidPositionManager(address(poolManager_), actualPoolManager);
        }
        poolManager = poolManager_;
        positionManager = positionManager_;
        weth = weth_;
        challengeRouter = challengeRouter_;
        launchAuthority = launchAuthority_;
        tokenCreationCodeHash = tokenCreationCodeHash_;
        hookCreationCodeHash = hookCreationCodeHash_;
    }

    function predictTokenAddress(bytes32 tokenSalt, bytes calldata tokenCreationCode) public view returns (address) {
        _requireCreationCode(tokenCreationCode, tokenCreationCodeHash);
        bytes memory initCode = bytes.concat(tokenCreationCode, abi.encode(address(this)));
        return Create2.computeAddress(tokenSalt, keccak256(initCode), address(this));
    }

    function predictHookAddress(bytes32 hookSalt, address token_, bytes calldata hookCreationCode)
        public
        view
        returns (address)
    {
        _requireCreationCode(hookCreationCode, hookCreationCodeHash);
        bytes memory initCode =
            bytes.concat(hookCreationCode, abi.encode(poolManager, weth, token_, challengeRouter, address(this)));
        return Create2.computeAddress(hookSalt, keccak256(initCode), address(this));
    }

    function deployAssets(
        bytes calldata tokenCreationCode,
        bytes calldata hookCreationCode,
        bytes32 tokenSalt,
        bytes32 hookSalt
    ) external nonReentrant returns (address tokenAddress, address hookAddress) {
        _requireLaunchAuthority();
        return _deployAssets(tokenCreationCode, hookCreationCode, tokenSalt, hookSalt);
    }

    /// @notice Deploys the committed token and hook, initializes the pool, and locks initial liquidity atomically.
    /// @dev Any failure rolls back both CREATE2 child deployments and the complete liquidity lifecycle.
    function deployAndLaunch(
        bytes calldata tokenCreationCode,
        bytes calldata hookCreationCode,
        bytes32 tokenSalt,
        bytes32 hookSalt,
        uint160 initialSqrtPriceX96,
        uint256 wethLiquidityBudget
    ) external nonReentrant returns (LaunchResult memory result) {
        _requireLaunchAuthority();
        _deployAssets(tokenCreationCode, hookCreationCode, tokenSalt, hookSalt);
        result = _launch(initialSqrtPriceX96, wethLiquidityBudget);
    }

    function _deployAssets(
        bytes calldata tokenCreationCode,
        bytes calldata hookCreationCode,
        bytes32 tokenSalt,
        bytes32 hookSalt
    ) private returns (address tokenAddress, address hookAddress) {
        if (assetsDeployed) revert AssetsAlreadyDeployed();

        address predictedToken = predictTokenAddress(tokenSalt, tokenCreationCode);
        if (predictedToken <= weth) revert InvalidTokenOrdering(weth, predictedToken);
        address predictedHook = predictHookAddress(hookSalt, predictedToken, hookCreationCode);
        uint160 actualFlags = uint160(predictedHook) & Hooks.ALL_HOOK_MASK;
        if (actualFlags != REQUIRED_HOOK_FLAGS) {
            revert HookAddressFlagsInvalid(predictedHook, actualFlags, REQUIRED_HOOK_FLAGS);
        }

        bytes memory tokenInitCode = bytes.concat(tokenCreationCode, abi.encode(address(this)));
        OvertimeToken token_ = OvertimeToken(Create2.deploy(0, tokenSalt, tokenInitCode));
        bytes memory hookInitCode = bytes.concat(
            hookCreationCode, abi.encode(poolManager, weth, address(token_), challengeRouter, address(this))
        );
        OvertimeHook hook_ = OvertimeHook(Create2.deploy(0, hookSalt, hookInitCode));
        assert(address(token_) == predictedToken && address(hook_) == predictedHook);
        overtimeToken = token_;
        overtimeHook = hook_;
        assetsDeployed = true;
        emit OvertimeAssetsDeployed(address(token_), address(hook_));
        return (address(token_), address(hook_));
    }

    function launch(uint160 initialSqrtPriceX96, uint256 wethLiquidityBudget)
        external
        nonReentrant
        returns (LaunchResult memory result)
    {
        _requireLaunchAuthority();
        result = _launch(initialSqrtPriceX96, wethLiquidityBudget);
    }

    function _launch(uint160 initialSqrtPriceX96, uint256 wethLiquidityBudget)
        private
        returns (LaunchResult memory result)
    {
        if (!assetsDeployed) revert AssetsNotDeployed();
        if (launched) revert AlreadyLaunched();
        if (wethLiquidityBudget != WETH_LIQUIDITY_BUDGET) {
            revert InvalidWethLiquidityBudget(wethLiquidityBudget, WETH_LIQUIDITY_BUDGET);
        }
        if (initialSqrtPriceX96 != INITIAL_SQRT_PRICE_X96) {
            revert InvalidInitialPrice(initialSqrtPriceX96);
        }

        uint256 balanceBefore = IERC20(weth).balanceOf(address(this));
        IERC20(weth).safeTransferFrom(msg.sender, address(this), wethLiquidityBudget);
        uint256 received = IERC20(weth).balanceOf(address(this)) - balanceBefore;
        if (received != wethLiquidityBudget) revert LiquidityTransferMismatch(weth, wethLiquidityBudget, received);

        launched = true;
        result = _mintLockedPosition(overtimeToken, overtimeHook, initialSqrtPriceX96, wethLiquidityBudget);
        launchResult = result;
        _emitLaunch(result, initialSqrtPriceX96);
    }

    function _requireLaunchAuthority() private view {
        if (msg.sender != launchAuthority) revert LaunchUnauthorized(msg.sender, launchAuthority);
    }

    function _emitLaunch(LaunchResult memory result, uint160 initialSqrtPriceX96) private {
        emit OvertimeLaunched(
            result.token,
            result.hook,
            result.vault,
            result.positionTokenId,
            result.poolId,
            result.wethLiquidity,
            result.tokenLiquidity,
            initialSqrtPriceX96
        );
    }

    function _mintLockedPosition(
        OvertimeToken token_,
        OvertimeHook hook_,
        uint160 initialSqrtPriceX96,
        uint256 wethLiquidityBudget
    ) private returns (LaunchResult memory result) {
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(weth),
            currency1: Currency.wrap(address(token_)),
            fee: hook_.CANONICAL_LP_FEE(),
            tickSpacing: hook_.CANONICAL_TICK_SPACING(),
            hooks: hook_
        });
        int24 initialTick = poolManager.initialize(key, initialSqrtPriceX96);
        int24 expectedTick = TickMath.getTickAtSqrtPrice(initialSqrtPriceX96);
        if (initialTick != expectedTick) revert InvalidInitialTick(initialTick, expectedTick);

        result.positionTokenId = positionManager.nextTokenId();
        LockedLiquidityVault vault_ = new LockedLiquidityVault(positionManager, result.positionTokenId);
        CurrencyAmounts memory available =
            CurrencyAmounts({ amount0: wethLiquidityBudget, amount1: token_.FIXED_SUPPLY() });
        (Plan memory plan, CurrencyAmounts memory remaining) =
            _buildPlan(key, initialSqrtPriceX96, hook_.CANONICAL_TICK_SPACING(), available, address(vault_));

        IERC20(weth).safeTransfer(address(positionManager), wethLiquidityBudget);
        IERC20(address(token_)).safeTransfer(address(positionManager), token_.FIXED_SUPPLY());
        positionManager.modifyLiquidities(abi.encode(plan.actions, plan.params), block.timestamp);

        address owner = IERC721(address(positionManager)).ownerOf(result.positionTokenId);
        if (owner != address(vault_)) revert PositionNotLocked(result.positionTokenId, owner, address(vault_));

        result.token = address(token_);
        result.hook = address(hook_);
        result.vault = address(vault_);
        result.wethLiquidity = available.amount0 - remaining.amount0;
        result.tokenLiquidity = available.amount1 - remaining.amount1;
        result.poolId = PoolId.unwrap(key.toId());
    }

    function _buildPlan(
        PoolKey memory key,
        uint160 initialSqrtPriceX96,
        int24 tickSpacing,
        CurrencyAmounts memory available,
        address vault
    ) private pure returns (Plan memory plan, CurrencyAmounts memory remaining) {
        PositionDefinition[] memory definitions = new PositionDefinition[](0);
        Position[] memory positions;
        (positions, remaining) =
            PositionPlanner.resolve(definitions, initialSqrtPriceX96, tickSpacing, available, vault);
        if (positions.length != 1) revert UnexpectedPositionCount(positions.length);
        plan = PositionPlanner.toPlan(positions, key, vault);
    }

    function _requireCreationCode(bytes calldata creationCode, bytes32 expectedHash) private pure {
        bytes32 actualHash = keccak256(creationCode);
        if (actualHash != expectedHash) revert InvalidCreationCode(actualHash, expectedHash);
    }
}
