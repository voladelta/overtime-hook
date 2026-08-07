// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { CustomRevert } from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { TransientStateLibrary } from "@uniswap/v4-core/src/libraries/TransientStateLibrary.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { IPositionManager } from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import { HookMiner } from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import { LockedLiquidityVault } from "../../src/LockedLiquidityVault.sol";
import { OvertimeChallengeRouter } from "../../src/OvertimeChallengeRouter.sol";
import { OvertimeHook } from "../../src/OvertimeHook.sol";
import { OvertimeLauncher } from "../../src/OvertimeLauncher.sol";
import { OvertimeToken } from "../../src/OvertimeToken.sol";

contract OvertimeMainnetForkTest is Test {
    using TransientStateLibrary for IPoolManager;

    struct ForkDeployment {
        IPoolManager manager;
        OvertimeChallengeRouter challengeRouter;
        OvertimeHook hook;
        PoolKey key;
        address token;
    }

    uint256 private constant CANDIDATE_BLOCK = 25_700_561;
    string private constant PUBLIC_MAINNET_RPC = "https://eth.drpc.org";

    address private constant POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    address private constant POSITION_MANAGER = 0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e;
    address private constant STATE_VIEW = 0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227;
    address private constant V4_QUOTER = 0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203;
    address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    bytes32 private constant POOL_MANAGER_RUNTIME_HASH =
        0x785f1014552b7ce7d5fb7d0c970ca60edee94fd00425d7ca21609acac7ce1293;
    bytes32 private constant POSITION_MANAGER_RUNTIME_HASH =
        0x77e36c08b19959a30dde46dec9abe6208e371ff2f56884a56fe1e1a53615528b;
    bytes32 private constant STATE_VIEW_RUNTIME_HASH =
        0xd7947778589cf4aac9a092a4451292a2056380941635ab7006d3c691d8dfd878;
    bytes32 private constant V4_QUOTER_RUNTIME_HASH =
        0x06de58fa119c5deaa7a667fb92d3894e25d9160e62fb82c8d86d43b47eefe441;
    bytes32 private constant WETH_RUNTIME_HASH = 0xd0a06b12ac47863b5c7be4185c2deaad1c61557033f56c7d4ea74429cbb25e23;

    uint160 private constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    function testFork_pinnedCandidateLifecycle() public {
        vm.createSelectFork(_rpcUrl(), CANDIDATE_BLOCK);
        emit log_named_uint("pinned candidate block", block.number);
        _assertProductionDependencies();
        _runLifecycleAndFailurePaths();
    }

    function testFork_currentHeadLifecycleSmoke() public {
        vm.createSelectFork(_rpcUrl());
        emit log_named_uint("current head block", block.number);
        _assertProductionDependencies();
        _runLifecycleAndFailurePaths();
    }

    function _runLifecycleAndFailurePaths() private {
        ForkDeployment memory deployment = _deployLifecycle();
        address player = makeAddr("fork-player");
        deal(WETH, player, 1 ether);
        vm.prank(player);
        IERC20(WETH).approve(address(deployment.challengeRouter), type(uint256).max);

        _assertFailurePaths(deployment, player);
        _challengeFinalizeAndClaim(deployment, player);
    }

    function _deployLifecycle() private returns (ForkDeployment memory deployment) {
        IPoolManager manager = IPoolManager(POOL_MANAGER);
        OvertimeChallengeRouter challengeRouter = new OvertimeChallengeRouter(manager, WETH);
        bytes memory tokenCreationCode = type(OvertimeToken).creationCode;
        bytes memory hookCreationCode = type(OvertimeHook).creationCode;
        OvertimeLauncher launcher = new OvertimeLauncher(
            manager,
            IPositionManager(POSITION_MANAGER),
            WETH,
            address(challengeRouter),
            address(this),
            keccak256(tokenCreationCode),
            keccak256(hookCreationCode)
        );
        (bytes32 tokenSalt, address predictedToken) = _mineOrderedToken(launcher, tokenCreationCode);
        (, bytes32 hookSalt) = HookMiner.find(
            address(launcher),
            FLAGS,
            hookCreationCode,
            abi.encode(manager, WETH, predictedToken, address(challengeRouter), address(launcher))
        );

        uint256 committedBudget = launcher.WETH_LIQUIDITY_BUDGET();
        deal(WETH, address(this), committedBudget);
        IERC20(WETH).approve(address(launcher), committedBudget);
        OvertimeLauncher.LaunchResult memory result = launcher.deployAndLaunch(
            tokenCreationCode, hookCreationCode, tokenSalt, hookSalt, launcher.INITIAL_SQRT_PRICE_X96(), committedBudget
        );
        OvertimeHook hook = OvertimeHook(result.hook);
        PoolKey memory key = hook.canonicalPoolKey();

        assertEq(result.token, predictedToken);
        assertEq(uint160(result.hook) & Hooks.ALL_HOOK_MASK, FLAGS);
        assertEq(IERC721(POSITION_MANAGER).ownerOf(result.positionTokenId), result.vault);
        assertTrue(LockedLiquidityVault(result.vault).positionIsLocked());
        assertGt(result.wethLiquidity, 0);
        assertGt(result.tokenLiquidity, 0);
        assertEq(IERC20(WETH).balanceOf(address(launcher)), 0);
        assertEq(IERC20(result.token).balanceOf(address(launcher)), 0);
        _assertZeroDeltas(manager, address(launcher), address(challengeRouter), address(hook), key);

        deployment = ForkDeployment({
            manager: manager, challengeRouter: challengeRouter, hook: hook, key: key, token: result.token
        });
    }

    function _assertFailurePaths(ForkDeployment memory deployment, address player) private {
        uint256 playerWethBefore = IERC20(WETH).balanceOf(player);
        vm.prank(player);
        vm.expectPartialRevert(OvertimeChallengeRouter.ChallengeDeadlineExpired.selector);
        deployment.challengeRouter
            .challenge(deployment.key, 0.01 ether, 1, block.timestamp - 1, TickMath.MIN_SQRT_PRICE + 1);
        assertEq(IERC20(WETH).balanceOf(player), playerWethBefore);
        assertEq(deployment.hook.totalWethTaken(), 0);

        vm.prank(player);
        vm.expectPartialRevert(CustomRevert.WrappedError.selector);
        deployment.challengeRouter
            .challenge(
                deployment.key, 0.01 ether, type(uint256).max, block.timestamp + 1 minutes, TickMath.MIN_SQRT_PRICE + 1
            );
        assertEq(IERC20(WETH).balanceOf(player), playerWethBefore);
        assertEq(deployment.hook.totalWethTaken(), 0);
        assertEq(deployment.hook.roundId(), 0);
        _assertDeploymentZeroDeltas(deployment, player);
    }

    function _challengeFinalizeAndClaim(ForkDeployment memory deployment, address player) private {
        vm.prank(player);
        uint256 tokenOut = deployment.challengeRouter
            .challenge(deployment.key, 0.01 ether, 1, block.timestamp + 1 minutes, TickMath.MIN_SQRT_PRICE + 1);
        assertGt(tokenOut, 0);
        assertEq(IERC20(deployment.token).balanceOf(player), tokenOut);
        assertEq(deployment.hook.totalGrossQuoteVolume(), 0.01 ether);
        assertEq(deployment.hook.programmableFeeLiability(), 0.000_01 ether);
        assertEq(deployment.hook.totalFeesAccrued(), 0.000_11 ether);
        _assertSolvent(deployment.manager, deployment.hook);
        _assertDeploymentZeroDeltas(deployment, player);

        (,, uint64 softEnd,,,,,,) = deployment.hook.currentRound();
        vm.warp(softEnd);
        assertTrue(deployment.hook.finalizeExpiredRound());
        uint256 rewardsBefore = IERC20(WETH).balanceOf(player);
        vm.startPrank(player);
        uint256 championReward = deployment.hook.claimChampionReward(1);
        uint256 crownTimeReward = deployment.hook.claimCrownTimeReward(1);
        vm.stopPrank();
        assertEq(IERC20(WETH).balanceOf(player) - rewardsBefore, championReward + crownTimeReward);

        address programmableOwner = deployment.hook.PROGRAMMABLE_FEE_OWNER();
        uint256 programmableBefore = IERC20(WETH).balanceOf(programmableOwner);
        vm.prank(programmableOwner);
        uint256 programmableReward = deployment.hook.claimProgrammableFees(programmableOwner);
        assertEq(IERC20(WETH).balanceOf(programmableOwner) - programmableBefore, programmableReward);
        assertEq(deployment.hook.programmableFeeLiability(), 0);
        _assertSolvent(deployment.manager, deployment.hook);
        _assertDeploymentZeroDeltas(deployment, player);
    }

    function _assertProductionDependencies() private view {
        assertEq(POOL_MANAGER.codehash, POOL_MANAGER_RUNTIME_HASH);
        assertEq(POSITION_MANAGER.codehash, POSITION_MANAGER_RUNTIME_HASH);
        assertEq(STATE_VIEW.codehash, STATE_VIEW_RUNTIME_HASH);
        assertEq(V4_QUOTER.codehash, V4_QUOTER_RUNTIME_HASH);
        assertEq(WETH.codehash, WETH_RUNTIME_HASH);
        assertEq(address(IPositionManager(POSITION_MANAGER).poolManager()), POOL_MANAGER);
        assertEq(IERC20Metadata(WETH).decimals(), 18);
    }

    function _assertSolvent(IPoolManager manager, OvertimeHook hook) private view {
        uint256 backing = manager.balanceOf(address(hook), uint256(uint160(WETH)));
        assertEq(backing, hook.totalUnclaimedLiabilities());
        assertEq(hook.totalWethTaken() - hook.totalWethClaimed(), hook.totalUnclaimedLiabilities());
    }

    function _assertDeploymentZeroDeltas(ForkDeployment memory deployment, address actor) private view {
        _assertZeroDeltas(
            deployment.manager, actor, address(deployment.challengeRouter), address(deployment.hook), deployment.key
        );
    }

    function _assertZeroDeltas(IPoolManager manager, address actor, address router, address hook, PoolKey memory key)
        private
        view
    {
        assertEq(manager.getNonzeroDeltaCount(), 0);
        assertEq(manager.currencyDelta(actor, key.currency0), 0);
        assertEq(manager.currencyDelta(actor, key.currency1), 0);
        assertEq(manager.currencyDelta(router, key.currency0), 0);
        assertEq(manager.currencyDelta(router, key.currency1), 0);
        assertEq(manager.currencyDelta(hook, key.currency0), 0);
        assertEq(manager.currencyDelta(hook, key.currency1), 0);
    }

    function _mineOrderedToken(OvertimeLauncher launcher, bytes memory tokenCreationCode)
        private
        view
        returns (bytes32 salt, address token)
    {
        for (uint256 i; i < 1000; ++i) {
            salt = bytes32(i);
            token = launcher.predictTokenAddress(salt, tokenCreationCode);
            if (token > WETH) return (salt, token);
        }
        revert("ordered token salt not found");
    }

    function _rpcUrl() private view returns (string memory) {
        return vm.envOr("MAINNET_RPC_URL", PUBLIC_MAINNET_RPC);
    }
}
