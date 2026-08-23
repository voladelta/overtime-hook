// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";

import {OvertimeHook} from "../../src/OvertimeHook.sol";
import {OvertimeLauncher} from "../../src/OvertimeLauncher.sol";
import {OvertimeToken} from "../../src/tokens/OvertimeToken.sol";

contract OvertimeMainnetForkIntegrationTest is Test {
    uint256 internal constant FORK_BLOCK = 23_000_000;
    IPoolManager internal constant POOL_MANAGER = IPoolManager(0x000000000004444c5dc75cB358380D2e3dE08A90);
    IPositionManager internal constant POSITION_MANAGER = IPositionManager(0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e);
    IPermit2 internal constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    IERC20 internal constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    function test_pinnedMainnetLaunchFourSwapQuadrantsAndClaims() public {
        string memory rpcUrl = vm.envOr("MAINNET_RPC_URL", string(""));
        vm.skip(bytes(rpcUrl).length == 0, "MAINNET_RPC_URL is required for pinned mainnet proof");
        vm.createSelectFork(rpcUrl, FORK_BLOCK);

        assertGt(address(POOL_MANAGER).code.length, 0);
        assertGt(address(POSITION_MANAGER).code.length, 0);
        assertEq(address(POSITION_MANAGER.poolManager()), address(POOL_MANAGER));

        OvertimeLauncher launcher = new OvertimeLauncher(POOL_MANAGER, POSITION_MANAGER, PERMIT2, WETH, address(this));
        (bytes32 tokenSalt, address predictedToken) = _findTokenSalt(launcher);
        bytes32 hookHash = launcher.overtimeHookInitCodeHash(predictedToken, launcher.predictRouterAddress());
        bytes32 hookSalt = _findHookSalt(address(launcher.hookDeployer()), hookHash);

        deal(address(WETH), address(this), 100 ether, true);
        WETH.approve(address(launcher), 10 ether);
        (OvertimeToken token, OvertimeHook hook,) =
            launcher.launch(tokenSalt, hookSalt, launcher.overtimeTokenInitCodeHash(), hookHash);
        assertEq(uint160(address(hook)) & Hooks.ALL_HOOK_MASK, 0x20cc);
        assertTrue(launcher.liquidityVault().isLocked());

        WETH.approve(address(launcher.challengeRouter()), type(uint256).max);
        launcher.challengeRouter().challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
        assertGt(token.balanceOf(address(this)), 0);

        PoolSwapTest ordinaryRouter = new PoolSwapTest(POOL_MANAGER);
        WETH.approve(address(ordinaryRouter), type(uint256).max);
        token.approve(address(ordinaryRouter), type(uint256).max);
        _swap(ordinaryRouter, hook, true, -int256(0.1 ether), TickMath.MIN_SQRT_PRICE + 1);
        _swap(ordinaryRouter, hook, true, int256(1_000 ether), TickMath.MIN_SQRT_PRICE + 1);
        _swap(ordinaryRouter, hook, false, -int256(1_000 ether), TickMath.MAX_SQRT_PRICE - 1);
        _swap(ordinaryRouter, hook, false, int256(0.000001 ether), TickMath.MAX_SQRT_PRICE - 1);

        vm.warp(hook.currentRound().softEnd);
        hook.finalizeExpiredRound();
        hook.claimChampionReward(1);
        hook.claimCrownTimeReward(1);
        assertEq(hook.claimBacking(), hook.unclaimedLiabilities());
    }

    function _swap(
        PoolSwapTest ordinaryRouter,
        OvertimeHook hook,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96
    ) private {
        ordinaryRouter.swap(
            hook.canonicalPoolKey(),
            SwapParams({
                zeroForOne: zeroForOne, amountSpecified: amountSpecified, sqrtPriceLimitX96: sqrtPriceLimitX96
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    function _findTokenSalt(OvertimeLauncher launcher) private view returns (bytes32 salt, address predicted) {
        bytes32 hash = launcher.overtimeTokenInitCodeHash();
        for (uint256 i; i < 10_000; ++i) {
            salt = bytes32(i);
            predicted = launcher.predictCreate2(salt, hash);
            if (predicted > address(WETH)) return (salt, predicted);
        }
        revert("ordered OVERTIME salt not found");
    }

    function _findHookSalt(address deployer, bytes32 hash) private pure returns (bytes32 salt) {
        for (uint256 i; i < 1_000_000; ++i) {
            salt = bytes32(i);
            address predicted =
                address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, hash)))));
            if ((uint160(predicted) & Hooks.ALL_HOOK_MASK) == 0x20cc) return salt;
        }
        revert("Overtime hook salt not found");
    }
}
