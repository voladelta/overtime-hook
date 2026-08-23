// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {LockedLiquidityVault} from "../../src/LockedLiquidityVault.sol";
import {OvertimeHook} from "../../src/OvertimeHook.sol";
import {OvertimeLauncher} from "../../src/OvertimeLauncher.sol";
import {OvertimeToken} from "../../src/tokens/OvertimeToken.sol";
import {BaseTest} from "../utils/BaseTest.sol";

contract OvertimeLauncherIntegrationTest is BaseTest {
    MockERC20 internal weth;
    OvertimeLauncher internal launcher;
    bytes32 internal tokenSalt;
    bytes32 internal hookSalt;
    address internal predictedToken;
    address internal predictedHook;

    function setUp() public {
        deployArtifactsAndLabel();
        weth = deployToken();
        launcher = new OvertimeLauncher(poolManager, positionManager, permit2, IERC20(address(weth)), address(this));
        (tokenSalt, predictedToken) = _findOrderedTokenSalt();
        (hookSalt, predictedHook) = _findHookSalt(predictedToken);
    }

    function test_atomicLaunchFormsPoolAndPermanentlyLocksPosition() public {
        weth.approve(address(launcher), 10 ether);
        uint256 wethBefore = weth.balanceOf(address(this));
        uint256 gasBefore = gasleft();
        (OvertimeToken token, OvertimeHook hook, LockedLiquidityVault vault) = launcher.launch(
            tokenSalt,
            hookSalt,
            launcher.overtimeTokenInitCodeHash(),
            launcher.overtimeHookInitCodeHash(predictedToken, launcher.predictRouterAddress())
        );
        uint256 launchGas = gasBefore - gasleft();

        assertEq(address(token), predictedToken);
        assertEq(address(hook), predictedHook);
        assertEq(uint160(address(hook)) & Hooks.ALL_HOOK_MASK, 0x20cc);
        assertEq(wethBefore - weth.balanceOf(address(this)), 10 ether);
        assertEq(token.totalSupply(), 1_000_000_000 ether);
        assertEq(token.balanceOf(address(launcher)), 0);
        assertEq(weth.balanceOf(address(launcher)), 0);
        assertEq(hook.launcher(), address(launcher));
        assertEq(hook.challengeRouter(), address(launcher.challengeRouter()));
        assertEq(Currency.unwrap(hook.canonicalPoolKey().currency0), address(weth));
        assertEq(Currency.unwrap(hook.canonicalPoolKey().currency1), address(token));
        assertEq(address(vault.positionManager()), address(positionManager));
        assertEq(vault.tokenId(), launcher.positionTokenId());
        assertTrue(vault.isLocked());
        assertEq(
            positionManager.getPositionLiquidity(vault.tokenId()),
            launcher.positionManager().getPositionLiquidity(vault.tokenId())
        );
        assertGt(positionManager.getPositionLiquidity(vault.tokenId()), 0);
        assertLt(launchGas, 12_000_000);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        (bool transferred,) = address(positionManager)
            .call(
                abi.encodeWithSignature(
                    "transferFrom(address,address,uint256)", address(vault), attacker, vault.tokenId()
                )
            );
        assertFalse(transferred);
    }

    function test_launchRollbackRemovesEveryChildWhenFundingFails() public {
        bytes32 tokenHash = launcher.overtimeTokenInitCodeHash();
        bytes32 hookHash = launcher.overtimeHookInitCodeHash(predictedToken, launcher.predictRouterAddress());
        address predictedRouter = launcher.predictRouterAddress();

        vm.expectRevert();
        launcher.launch(tokenSalt, hookSalt, tokenHash, hookHash);

        assertEq(predictedRouter.code.length, 0);
        assertEq(predictedToken.code.length, 0);
        assertEq(predictedHook.code.length, 0);
        assertFalse(launcher.launched());
    }

    function test_committedHashesAndAuthorityAreEnforcedBeforeDeployment() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(OvertimeLauncher.OnlyLaunchAuthority.selector);
        launcher.launch(tokenSalt, hookSalt, bytes32(0), bytes32(0));

        vm.expectRevert(
            abi.encodeWithSelector(
                OvertimeLauncher.CreationCodeHashMismatch.selector, bytes32(0), launcher.overtimeTokenInitCodeHash()
            )
        );
        launcher.launch(tokenSalt, hookSalt, bytes32(0), bytes32(0));
        assertEq(launcher.predictRouterAddress().code.length, 0);
    }

    function _findOrderedTokenSalt() private view returns (bytes32 salt, address predicted) {
        bytes32 hash = launcher.overtimeTokenInitCodeHash();
        for (uint256 i; i < 1_000; ++i) {
            salt = bytes32(i);
            predicted = launcher.predictCreate2(salt, hash);
            if (predicted > address(weth)) return (salt, predicted);
        }
        revert("ordered token salt not found");
    }

    function _findHookSalt(address token) private view returns (bytes32 salt, address predicted) {
        for (uint256 i; i < 200_000; ++i) {
            salt = bytes32(i);
            predicted = launcher.predictOvertimeHook(salt, token);
            if ((uint160(predicted) & Hooks.ALL_HOOK_MASK) == 0x20cc) return (salt, predicted);
        }
        revert("hook salt not found");
    }
}
