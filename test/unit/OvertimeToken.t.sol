// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {OvertimeToken} from "../../src/tokens/OvertimeToken.sol";

contract OvertimeTokenTest is Test {
    function test_constructorMintsTheOnlySupplyToLauncher() public {
        address launcher = makeAddr("launcher");
        OvertimeToken token = new OvertimeToken(launcher);
        assertEq(token.name(), "Overtime");
        assertEq(token.symbol(), "OVERTIME");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 1_000_000_000 ether);
        assertEq(token.balanceOf(launcher), token.totalSupply());
    }

    function test_constructorRejectsZeroLauncher() public {
        vm.expectRevert(OvertimeToken.ZeroMintRecipient.selector);
        new OvertimeToken(address(0));
    }
}
