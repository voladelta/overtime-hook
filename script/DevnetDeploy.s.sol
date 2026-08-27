// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";

import {OvertimeHook} from "../src/OvertimeHook.sol";
import {OvertimeLauncher} from "../src/OvertimeLauncher.sol";
import {OvertimeToken} from "../src/tokens/OvertimeToken.sol";
import {Permit2Deployer} from "../test/utils/v4hook-testkit/artifacts/Permit2.sol";
import {V4PoolManagerDeployer} from "../test/utils/v4hook-testkit/artifacts/V4PoolManager.sol";
import {V4PositionManagerDeployer} from "../test/utils/v4hook-testkit/artifacts/V4PositionManager.sol";

contract DevnetDeployScript is Script {
    using SafeERC20 for IERC20;

    string private constant MNEMONIC = "test test test test test test test test test test test junk";
    uint256 private _deploymentBlock;

    function run() external {
        _deploymentBlock = block.number;
        address authority = msg.sender;
        vm.startBroadcast();
        IPermit2 permit2 = IPermit2(Permit2Deployer.deploy());
        IPoolManager manager = IPoolManager(V4PoolManagerDeployer.deploy(authority));
        IPositionManager positions = IPositionManager(
            V4PositionManagerDeployer.deploy(address(manager), address(permit2), 300_000, address(0), address(0))
        );
        MockERC20 weth = new MockERC20("Wrapped Ether", "WETH", 18);
        weth.mint(authority, 1_020 ether);
        OvertimeLauncher launcher = new OvertimeLauncher(manager, positions, permit2, IERC20(address(weth)), authority);
        vm.stopBroadcast();

        (bytes32 tokenSalt, address predictedToken) = _findTokenSalt(launcher, address(weth));
        bytes32 hookHash = launcher.overtimeHookInitCodeHash(predictedToken, launcher.predictRouterAddress());
        bytes32 hookSalt = _findHookSalt(address(launcher.hookDeployer()), hookHash);

        vm.startBroadcast();
        weth.approve(address(launcher), launcher.INITIAL_WETH_BUDGET());
        (OvertimeToken token, OvertimeHook hook,) =
            launcher.launch(tokenSalt, hookSalt, launcher.overtimeTokenInitCodeHash(), hookHash);
        for (uint32 i; i < 100; ++i) {
            address trader = vm.addr(vm.deriveKey(MNEMONIC, i));
            IERC20(address(weth)).safeTransfer(trader, 10 ether);
        }
        vm.stopBroadcast();

        _writeManifest(launcher, manager, positions, permit2, weth, token, hook);
    }

    function _findTokenSalt(OvertimeLauncher launcher, address weth)
        private
        view
        returns (bytes32 salt, address predicted)
    {
        bytes32 hash = launcher.overtimeTokenInitCodeHash();
        for (uint256 i; i < 10_000; ++i) {
            salt = bytes32(i);
            predicted = launcher.predictCreate2(salt, hash);
            if (predicted > weth) return (salt, predicted);
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

    function _writeManifest(
        OvertimeLauncher launcher,
        IPoolManager manager,
        IPositionManager positions,
        IPermit2 permit2,
        MockERC20 weth,
        OvertimeToken token,
        OvertimeHook hook
    ) private {
        string memory contractsJson = "contracts";
        vm.serializeAddress(contractsJson, "challengeRouter", address(launcher.challengeRouter()));
        vm.serializeAddress(contractsJson, "hook", address(hook));
        vm.serializeAddress(contractsJson, "launcher", address(launcher));
        vm.serializeAddress(contractsJson, "liquidityVault", address(launcher.liquidityVault()));
        vm.serializeAddress(contractsJson, "overtimeToken", address(token));
        vm.serializeAddress(contractsJson, "permit2", address(permit2));
        vm.serializeAddress(contractsJson, "poolManager", address(manager));
        vm.serializeAddress(contractsJson, "positionManager", address(positions));
        string memory contractsObject = vm.serializeAddress(contractsJson, "weth", address(weth));

        string memory poolJson = "pool";
        vm.serializeUint(poolJson, "fee", hook.LP_FEE());
        vm.serializeString(poolJson, "initialSqrtPriceX96", vm.toString(hook.INITIAL_SQRT_PRICE_X96()));
        string memory poolObject = vm.serializeInt(poolJson, "tickSpacing", hook.TICK_SPACING());

        string memory root = "deployment";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeUint(root, "deploymentBlock", _deploymentBlock);
        vm.serializeString(root, "network", "overtime-local");
        string memory json =
            vm.serializeString(root, "rpcUrl", vm.envOr("DEVNET_RPC_URL", string("http://127.0.0.1:8545")));
        string memory path = ".devnet/deployment.json";
        vm.writeJson(json, path);
        vm.writeJson(contractsObject, path, ".contracts");
        vm.writeJson(poolObject, path, ".pool");
    }
}
