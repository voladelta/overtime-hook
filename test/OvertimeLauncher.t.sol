// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Deployers } from "@uniswap/v4-core/test/utils/Deployers.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { IAllowanceTransfer } from "permit2/src/interfaces/IAllowanceTransfer.sol";
import { HookMiner } from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import { IPositionDescriptor } from "@uniswap/v4-periphery/src/interfaces/IPositionDescriptor.sol";
import { IWETH9 } from "@uniswap/v4-periphery/src/interfaces/external/IWETH9.sol";
import { PositionManager } from "@uniswap/v4-periphery/src/PositionManager.sol";

import { LockedLiquidityVault } from "../src/LockedLiquidityVault.sol";
import { OvertimeChallengeRouter } from "../src/OvertimeChallengeRouter.sol";
import { OvertimeHook } from "../src/OvertimeHook.sol";
import { OvertimeLauncher } from "../src/OvertimeLauncher.sol";
import { OvertimeToken } from "../src/OvertimeToken.sol";

contract OvertimeLauncherTest is Test, Deployers {
    uint160 private constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    PositionManager internal positionManager;
    OvertimeChallengeRouter internal challengeRouter;
    OvertimeLauncher internal launcher;
    IERC20 internal wethToken;
    bytes internal tokenCreationCode;
    bytes internal hookCreationCode;
    bytes32 internal tokenSalt;
    bytes32 internal hookSalt;
    address internal predictedToken;

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();
        wethToken = IERC20(Currency.unwrap(currency0));
        positionManager = new PositionManager(
            manager,
            IAllowanceTransfer(address(0)),
            300_000,
            IPositionDescriptor(address(0)),
            IWETH9(Currency.unwrap(currency0))
        );
        challengeRouter = new OvertimeChallengeRouter(manager, Currency.unwrap(currency0));
        tokenCreationCode = type(OvertimeToken).creationCode;
        hookCreationCode = type(OvertimeHook).creationCode;
        launcher = new OvertimeLauncher(
            manager,
            positionManager,
            Currency.unwrap(currency0),
            address(challengeRouter),
            address(this),
            keccak256(tokenCreationCode),
            keccak256(hookCreationCode)
        );
        wethToken.approve(address(launcher), type(uint256).max);
        (tokenSalt, predictedToken) = _mineOrderedToken();
        (, hookSalt) = HookMiner.find(
            address(launcher),
            FLAGS,
            hookCreationCode,
            abi.encode(manager, Currency.unwrap(currency0), predictedToken, address(challengeRouter), address(launcher))
        );
    }

    function test_twoPhaseLaunchAuthenticatesInitializationAndLocksSupplyLifecycle() public {
        address predictedHook = launcher.predictHookAddress(hookSalt, predictedToken, hookCreationCode);

        uint160 initialPrice = uint160(uint256(SQRT_PRICE_1_1) * 10_000);
        launcher.deployAssets(tokenCreationCode, hookCreationCode, tokenSalt, hookSalt);
        OvertimeLauncher.LaunchResult memory result = launcher.launch(initialPrice, 10 ether);

        assertEq(result.token, predictedToken);
        assertEq(result.hook, predictedHook);
        assertEq(uint160(result.hook) & Hooks.ALL_HOOK_MASK, 0x20cc);
        assertTrue(launcher.launched());
        assertEq(OvertimeToken(result.token).totalSupply(), 1_000_000_000 ether);
        assertEq(OvertimeToken(result.token).balanceOf(address(launcher)), 0);
        assertEq(wethToken.balanceOf(address(launcher)), 0);
        assertEq(IERC721(address(positionManager)).ownerOf(result.positionTokenId), result.vault);
        assertTrue(LockedLiquidityVault(result.vault).positionIsLocked());
        assertGt(result.wethLiquidity, 0);
        assertGt(result.tokenLiquidity, 0);
        assertEq(OvertimeHook(result.hook).canonicalPoolId(), result.poolId);

        vm.expectRevert();
        positionManager.transferFrom(result.vault, address(this), result.positionTokenId);
    }

    function test_atomicLaunchAuthenticatesInitializationAndLocksSupplyLifecycle() public {
        address predictedHook = launcher.predictHookAddress(hookSalt, predictedToken, hookCreationCode);
        uint160 initialPrice = uint160(uint256(SQRT_PRICE_1_1) * 10_000);

        OvertimeLauncher.LaunchResult memory result = launcher.deployAndLaunch(
            tokenCreationCode, hookCreationCode, tokenSalt, hookSalt, initialPrice, 10 ether
        );

        assertEq(result.token, predictedToken);
        assertEq(result.hook, predictedHook);
        assertEq(uint160(result.hook) & Hooks.ALL_HOOK_MASK, 0x20cc);
        assertEq(IERC721(address(positionManager)).ownerOf(result.positionTokenId), result.vault);
        assertTrue(LockedLiquidityVault(result.vault).positionIsLocked());
        assertEq(OvertimeToken(result.token).balanceOf(address(launcher)), 0);
        assertEq(wethToken.balanceOf(address(launcher)), 0);
    }

    function test_atomicLaunchRollbackRemovesChildrenAndState() public {
        address predictedHook = launcher.predictHookAddress(hookSalt, predictedToken, hookCreationCode);

        vm.expectRevert(abi.encodeWithSelector(OvertimeLauncher.InvalidInitialPrice.selector, uint160(0)));
        launcher.deployAndLaunch(tokenCreationCode, hookCreationCode, tokenSalt, hookSalt, 0, 10 ether);

        assertFalse(launcher.assetsDeployed());
        assertFalse(launcher.launched());
        assertEq(predictedToken.code.length, 0);
        assertEq(predictedHook.code.length, 0);
    }

    function test_launcherIsOneShot() public {
        uint160 initialPrice = uint160(uint256(SQRT_PRICE_1_1) * 10_000);
        launcher.deployAssets(tokenCreationCode, hookCreationCode, tokenSalt, hookSalt);
        launcher.launch(initialPrice, 10 ether);
        vm.expectRevert(OvertimeLauncher.AlreadyLaunched.selector);
        launcher.launch(initialPrice, 10 ether);
    }

    function test_gas_deployAssets() public {
        launcher.deployAssets(tokenCreationCode, hookCreationCode, tokenSalt, hookSalt);
    }

    function test_gas_lockLiquidity() public {
        vm.pauseGasMetering();
        launcher.deployAssets(tokenCreationCode, hookCreationCode, tokenSalt, hookSalt);
        vm.resumeGasMetering();
        launcher.launch(uint160(uint256(SQRT_PRICE_1_1) * 10_000), 10 ether);
    }

    function test_gas_atomicLaunch() public {
        launcher.deployAndLaunch(
            tokenCreationCode,
            hookCreationCode,
            tokenSalt,
            hookSalt,
            uint160(uint256(SQRT_PRICE_1_1) * 10_000),
            10 ether
        );
    }

    function test_creationCodeCommitmentRejectsSubstitution() public {
        bytes memory wrong = abi.encodePacked(tokenCreationCode, bytes1(0x00));
        vm.expectRevert();
        launcher.predictTokenAddress(bytes32(0), wrong);
    }

    function _mineOrderedToken() private view returns (bytes32 salt, address token) {
        for (uint256 i; i < 1000; ++i) {
            salt = bytes32(i);
            token = launcher.predictTokenAddress(salt, tokenCreationCode);
            if (token > Currency.unwrap(currency0)) return (salt, token);
        }
        revert("ordered token salt not found");
    }
}
