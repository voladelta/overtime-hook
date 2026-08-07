// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IPositionManager } from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

contract OvertimeMainnetForkTest is Test {
    uint256 private constant FORK_BLOCK = 25_700_561;
    address private constant POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    address private constant POSITION_MANAGER = 0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e;
    address private constant STATE_VIEW = 0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227;
    address private constant V4_QUOTER = 0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203;
    address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    bytes32 private constant POOL_MANAGER_RUNTIME_HASH =
        0x785f1014552b7ce7d5fb7d0c970ca60edee94fd00425d7ca21609acac7ce1293;
    bytes32 private constant POSITION_MANAGER_RUNTIME_HASH =
        0x77e36c08b19959a30dde46dec9abe6208e371ff2f56884a56fe1e1a53615528b;

    function testFork_mainnetDependenciesMatchProductionSnapshot() public {
        string memory rpcUrl = vm.envOr("MAINNET_RPC_URL", string(""));
        vm.skip(bytes(rpcUrl).length == 0);
        vm.createSelectFork(rpcUrl, FORK_BLOCK);

        assertEq(POOL_MANAGER.codehash, POOL_MANAGER_RUNTIME_HASH);
        assertEq(POSITION_MANAGER.codehash, POSITION_MANAGER_RUNTIME_HASH);
        assertGt(STATE_VIEW.code.length, 0);
        assertGt(V4_QUOTER.code.length, 0);
        assertEq(address(IPositionManager(POSITION_MANAGER).poolManager()), POOL_MANAGER);
        assertEq(IERC20Metadata(WETH).decimals(), 18);
    }
}
