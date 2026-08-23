// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {OvertimeHook} from "../OvertimeHook.sol";
import {OvertimeChallengeRouter} from "../router/OvertimeChallengeRouter.sol";
import {OvertimeToken} from "../tokens/OvertimeToken.sol";

abstract contract OvertimeDeployerAuthority {
    error DeploymentFailed();
    error OnlyLauncher();

    address public immutable launcher;

    constructor(address launcher_) {
        launcher = launcher_;
    }

    modifier onlyLauncher() {
        if (msg.sender != launcher) revert OnlyLauncher();
        _;
    }
}

contract OvertimeTokenDeployer is OvertimeDeployerAuthority {
    constructor(address launcher_) OvertimeDeployerAuthority(launcher_) {}

    function initCodeHash() public view returns (bytes32) {
        return keccak256(abi.encodePacked(type(OvertimeToken).creationCode, abi.encode(launcher)));
    }

    function predict(bytes32 salt) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash())))));
    }

    function deploy(bytes32 salt) external onlyLauncher returns (OvertimeToken token) {
        bytes memory initCode = abi.encodePacked(type(OvertimeToken).creationCode, abi.encode(launcher));
        address deployed;
        assembly ("memory-safe") {
            deployed := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        if (deployed == address(0)) revert DeploymentFailed();
        token = OvertimeToken(deployed);
    }
}

contract OvertimeRouterDeployer is OvertimeDeployerAuthority {
    constructor(address launcher_) OvertimeDeployerAuthority(launcher_) {}

    function predict() public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(hex"d694", address(this), hex"01")))));
    }

    function deploy(IPoolManager manager, IERC20 weth) external onlyLauncher returns (OvertimeChallengeRouter) {
        return new OvertimeChallengeRouter(manager, weth, launcher);
    }
}

contract OvertimeHookDeployer is OvertimeDeployerAuthority {
    constructor(address launcher_) OvertimeDeployerAuthority(launcher_) {}

    function initCodeHash(IPoolManager manager, address weth, address token, address router)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(type(OvertimeHook).creationCode, abi.encode(manager, weth, token, router, launcher))
        );
    }

    function predict(bytes32 salt, bytes32 hash) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, hash)))));
    }

    function deploy(bytes32 salt, IPoolManager manager, address weth, address token, address router)
        external
        onlyLauncher
        returns (OvertimeHook)
    {
        return new OvertimeHook{salt: salt}(manager, weth, token, router, launcher);
    }
}
