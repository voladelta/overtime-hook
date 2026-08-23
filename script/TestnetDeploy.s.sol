// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";

import {OvertimeHook} from "../src/OvertimeHook.sol";
import {OvertimeLauncher} from "../src/OvertimeLauncher.sol";
import {OvertimeToken} from "../src/tokens/OvertimeToken.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
}

/// @notice Deploys Overtime from a pinned network manifest.
/// @dev Public broadcast remains gated by scripts/testnet-deploy.sh and a Foundry keystore account.
contract TestnetDeployScript is Script {
    using SafeERC20 for IERC20;

    error ChainIdMismatch(uint256 expected, uint256 actual);
    error DependencyMissing(address dependency);
    error PositionManagerMismatch(address expected, address actual);

    function run() external {
        string memory manifestPath = vm.envString("DEPLOYMENT_MANIFEST");
        string memory manifest = vm.readFile(manifestPath);
        uint256 expectedChainId = vm.parseJsonUint(manifest, ".chainId");
        if (block.chainid != expectedChainId) revert ChainIdMismatch(expectedChainId, block.chainid);

        IPoolManager manager = IPoolManager(vm.parseJsonAddress(manifest, ".contracts.poolManager"));
        IPositionManager positions = IPositionManager(vm.parseJsonAddress(manifest, ".contracts.positionManager"));
        IPermit2 permit2 = IPermit2(vm.parseJsonAddress(manifest, ".contracts.permit2"));
        IERC20 weth = IERC20(vm.parseJsonAddress(manifest, ".contracts.weth"));
        _requireCode(address(manager));
        _requireCode(address(positions));
        _requireCode(address(permit2));
        _requireCode(address(weth));
        if (address(positions.poolManager()) != address(manager)) {
            revert PositionManagerMismatch(address(manager), address(positions.poolManager()));
        }

        address authority = msg.sender;
        if (vm.envOr("OVERTIME_DRY_RUN", false)) {
            vm.deal(authority, 10 ether);
            vm.startBroadcast();
            IWETH(address(weth)).deposit{value: 10 ether}();
            vm.stopBroadcast();
        }

        vm.startBroadcast();
        OvertimeLauncher launcher = new OvertimeLauncher(manager, positions, permit2, weth, authority);
        vm.stopBroadcast();

        (bytes32 tokenSalt, address predictedToken) = _findTokenSalt(launcher, address(weth));
        bytes32 tokenHash = launcher.overtimeTokenInitCodeHash();
        bytes32 hookHash = launcher.overtimeHookInitCodeHash(predictedToken, launcher.predictRouterAddress());
        bytes32 hookSalt = _findHookSalt(address(launcher.hookDeployer()), hookHash);

        vm.startBroadcast();
        weth.forceApprove(address(launcher), launcher.INITIAL_WETH_BUDGET());
        (OvertimeToken token, OvertimeHook hook,) = launcher.launch(tokenSalt, hookSalt, tokenHash, hookHash);
        vm.stopBroadcast();

        _writeObservedManifest(manifest, launcher, token, hook);
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

    function _requireCode(address dependency) private view {
        if (dependency.code.length == 0) revert DependencyMissing(dependency);
    }

    function _writeObservedManifest(
        string memory sourceManifest,
        OvertimeLauncher launcher,
        OvertimeToken token,
        OvertimeHook hook
    ) private {
        string memory contractsJson = "observed-contracts";
        vm.serializeAddress(contractsJson, "challengeRouter", address(launcher.challengeRouter()));
        vm.serializeAddress(contractsJson, "hook", address(hook));
        vm.serializeAddress(contractsJson, "launcher", address(launcher));
        vm.serializeAddress(contractsJson, "liquidityVault", address(launcher.liquidityVault()));
        vm.serializeAddress(contractsJson, "overtimeToken", address(token));
        vm.serializeAddress(contractsJson, "permit2", vm.parseJsonAddress(sourceManifest, ".contracts.permit2"));
        vm.serializeAddress(contractsJson, "poolManager", vm.parseJsonAddress(sourceManifest, ".contracts.poolManager"));
        vm.serializeAddress(
            contractsJson, "positionManager", vm.parseJsonAddress(sourceManifest, ".contracts.positionManager")
        );
        string memory contractsObject =
            vm.serializeAddress(contractsJson, "weth", vm.parseJsonAddress(sourceManifest, ".contracts.weth"));

        string memory poolJson = "observed-pool";
        vm.serializeUint(poolJson, "fee", hook.LP_FEE());
        vm.serializeString(poolJson, "initialSqrtPriceX96", vm.toString(hook.INITIAL_SQRT_PRICE_X96()));
        string memory poolObject = vm.serializeInt(poolJson, "tickSpacing", hook.TICK_SPACING());

        string memory root = "observed-deployment";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeString(root, "network", vm.parseJsonString(sourceManifest, ".network"));
        string memory json = vm.serializeUint(root, "positionTokenId", launcher.positionTokenId());
        string memory outputPath = vm.envOr(
            "DEPLOYMENT_OUTPUT",
            string.concat("deployments/", vm.parseJsonString(sourceManifest, ".network"), ".local.json")
        );
        vm.writeJson(json, outputPath);
        vm.writeJson(contractsObject, outputPath, ".contracts");
        vm.writeJson(poolObject, outputPath, ".pool");
    }
}
