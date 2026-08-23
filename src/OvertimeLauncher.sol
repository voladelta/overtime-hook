// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

import {IERC721Owner, LockedLiquidityVault} from "./LockedLiquidityVault.sol";
import {OvertimeHook} from "./OvertimeHook.sol";
import {OvertimeHookDeployer, OvertimeRouterDeployer, OvertimeTokenDeployer} from "./deploy/OvertimeDeployers.sol";
import {OvertimeChallengeRouter} from "./router/OvertimeChallengeRouter.sol";
import {OvertimeToken} from "./tokens/OvertimeToken.sol";

contract OvertimeLauncher {
    using SafeERC20 for IERC20;

    uint256 public constant INITIAL_WETH_BUDGET = 10 ether;

    error AlreadyLaunched();
    error AssetBalanceRetained();
    error CreationCodeHashMismatch(bytes32 expected, bytes32 actual);
    error DeploymentFailed();
    error HookPermissionMismatch(address predicted);
    error InvalidAddress();
    error InvalidTokenOrdering(address predictedToken, address weth);
    error LiquidityNotLocked();
    error OnlyLaunchAuthority();
    error RouterPredictionMismatch(address expected, address actual);

    event OvertimeAssetsDeployed(
        address indexed overtimeToken, address indexed overtimeHook, address indexed challengeRouter
    );
    event OvertimeLaunchCompleted(
        address indexed overtimeToken,
        address indexed overtimeHook,
        address indexed liquidityVault,
        uint256 positionTokenId,
        uint128 liquidity
    );

    IPoolManager public immutable poolManager;
    IPositionManager public immutable positionManager;
    IPermit2 public immutable permit2;
    IERC20 public immutable weth;
    address public immutable launchAuthority;
    OvertimeTokenDeployer public immutable tokenDeployer;
    OvertimeRouterDeployer public immutable routerDeployer;
    OvertimeHookDeployer public immutable hookDeployer;

    bool public launched;
    OvertimeToken public overtimeToken;
    OvertimeHook public overtimeHook;
    OvertimeChallengeRouter public challengeRouter;
    LockedLiquidityVault public liquidityVault;
    uint256 public positionTokenId;

    constructor(
        IPoolManager poolManager_,
        IPositionManager positionManager_,
        IPermit2 permit2_,
        IERC20 weth_,
        address launchAuthority_
    ) {
        if (
            address(poolManager_) == address(0) || address(positionManager_) == address(0)
                || address(permit2_) == address(0) || address(weth_) == address(0) || launchAuthority_ == address(0)
        ) revert InvalidAddress();
        poolManager = poolManager_;
        positionManager = positionManager_;
        permit2 = permit2_;
        weth = weth_;
        launchAuthority = launchAuthority_;
        tokenDeployer = new OvertimeTokenDeployer(address(this));
        routerDeployer = new OvertimeRouterDeployer(address(this));
        hookDeployer = new OvertimeHookDeployer(address(this));
    }

    function launch(bytes32 tokenSalt, bytes32 hookSalt, bytes32 committedTokenHash, bytes32 committedHookHash)
        external
        returns (OvertimeToken token, OvertimeHook hook, LockedLiquidityVault vault)
    {
        if (msg.sender != launchAuthority) revert OnlyLaunchAuthority();
        if (launched) revert AlreadyLaunched();
        launched = true;

        bytes32 tokenHash = overtimeTokenInitCodeHash();
        if (committedTokenHash != tokenHash) revert CreationCodeHashMismatch(committedTokenHash, tokenHash);
        address tokenAddress = predictCreate2(tokenSalt, tokenHash);
        if (tokenAddress <= address(weth)) revert InvalidTokenOrdering(tokenAddress, address(weth));

        address routerAddress = routerDeployer.predict();
        bytes32 hookHash = overtimeHookInitCodeHash(tokenAddress, routerAddress);
        if (committedHookHash != hookHash) revert CreationCodeHashMismatch(committedHookHash, hookHash);
        address hookAddress = hookDeployer.predict(hookSalt, hookHash);
        if ((uint160(hookAddress) & Hooks.ALL_HOOK_MASK) != 0x20cc) {
            revert HookPermissionMismatch(hookAddress);
        }

        OvertimeChallengeRouter router = routerDeployer.deploy(poolManager, weth);
        if (address(router) != routerAddress) revert RouterPredictionMismatch(routerAddress, address(router));
        token = tokenDeployer.deploy(tokenSalt);
        hook = hookDeployer.deploy(hookSalt, poolManager, address(weth), address(token), address(router));
        if (address(token) != tokenAddress || address(hook) != hookAddress) revert DeploymentFailed();
        _verifyBindings(token, hook, router);
        router.bind(token, hook);

        // The immutable launch authority is also the only caller admitted at the function boundary.
        // slither-disable-next-line arbitrary-send-erc20
        weth.safeTransferFrom(launchAuthority, address(this), INITIAL_WETH_BUDGET);
        poolManager.initialize(hook.canonicalPoolKey(), hook.INITIAL_SQRT_PRICE_X96());
        (vault, positionTokenId) = _lockLiquidity(token, hook);

        if (weth.balanceOf(address(this)) != 0 || token.balanceOf(address(this)) != 0) {
            revert AssetBalanceRetained();
        }
        if (IERC721Owner(address(positionManager)).ownerOf(positionTokenId) != address(vault) || !vault.isLocked()) {
            revert LiquidityNotLocked();
        }

        overtimeToken = token;
        overtimeHook = hook;
        challengeRouter = router;
        liquidityVault = vault;
        emit OvertimeAssetsDeployed(address(token), address(hook), address(router));
        emit OvertimeLaunchCompleted(
            address(token),
            address(hook),
            address(vault),
            positionTokenId,
            positionManager.getPositionLiquidity(positionTokenId)
        );
    }

    function overtimeTokenInitCodeHash() public view returns (bytes32) {
        return tokenDeployer.initCodeHash();
    }

    function overtimeHookInitCodeHash(address token, address router) public view returns (bytes32) {
        return hookDeployer.initCodeHash(poolManager, address(weth), token, router);
    }

    function predictCreate2(bytes32 salt, bytes32 initCodeHash) public view returns (address) {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(tokenDeployer), salt, initCodeHash))))
        );
    }

    function predictRouterAddress() public view returns (address) {
        return routerDeployer.predict();
    }

    function predictOvertimeHook(bytes32 salt, address token) public view returns (address) {
        return hookDeployer.predict(salt, overtimeHookInitCodeHash(token, predictRouterAddress()));
    }

    function _lockLiquidity(OvertimeToken token, OvertimeHook hook)
        private
        returns (LockedLiquidityVault vault, uint256 tokenId)
    {
        int24 lower = TickMath.minUsableTick(hook.TICK_SPACING());
        int24 upper = TickMath.maxUsableTick(hook.TICK_SPACING());
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            hook.INITIAL_SQRT_PRICE_X96(),
            TickMath.getSqrtPriceAtTick(lower),
            TickMath.getSqrtPriceAtTick(upper),
            INITIAL_WETH_BUDGET,
            token.FIXED_SUPPLY()
        );
        tokenId = positionManager.nextTokenId();
        vault = new LockedLiquidityVault(positionManager, tokenId);

        weth.forceApprove(address(permit2), INITIAL_WETH_BUDGET);
        IERC20(address(token)).forceApprove(address(permit2), token.FIXED_SUPPLY());
        permit2.approve(address(weth), address(positionManager), uint160(INITIAL_WETH_BUDGET), type(uint48).max);
        permit2.approve(address(token), address(positionManager), uint160(token.FIXED_SUPPLY()), type(uint48).max);

        bytes memory actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR), uint8(Actions.SWEEP), uint8(Actions.SWEEP)
        );
        bytes[] memory params = new bytes[](4);
        params[0] = abi.encode(
            hook.canonicalPoolKey(),
            lower,
            upper,
            liquidity,
            INITIAL_WETH_BUDGET,
            token.FIXED_SUPPLY(),
            address(vault),
            bytes("")
        );
        params[1] = abi.encode(hook.canonicalPoolKey().currency0, hook.canonicalPoolKey().currency1);
        params[2] = abi.encode(hook.canonicalPoolKey().currency0, address(vault));
        params[3] = abi.encode(hook.canonicalPoolKey().currency1, address(vault));
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);

        uint256 wethRemainder = weth.balanceOf(address(this));
        if (wethRemainder != 0) weth.safeTransfer(address(vault), wethRemainder);
        uint256 overtimeRemainder = token.balanceOf(address(this));
        if (overtimeRemainder != 0) IERC20(address(token)).safeTransfer(address(vault), overtimeRemainder);
    }

    function _verifyBindings(OvertimeToken token, OvertimeHook hook, OvertimeChallengeRouter router) private view {
        if (
            hook.weth() != address(weth) || hook.overtimeToken() != address(token)
                || hook.challengeRouter() != address(router) || hook.launcher() != address(this)
                || address(hook.poolManager()) != address(poolManager)
        ) revert DeploymentFailed();
    }
}
