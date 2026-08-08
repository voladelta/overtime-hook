// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { RoundMath } from "../src/RoundMath.sol";

contract RoundMathHarness {
    function initial(uint64 timestamp) external pure returns (uint64, uint64) {
        return RoundMath.initialDeadlines(timestamp);
    }

    function extend(uint64 softEnd, uint64 hardEnd, uint64 timestamp) external pure returns (uint64) {
        return RoundMath.extendSoftEnd(softEnd, hardEnd, timestamp);
    }

    function cost(uint256 pot) external pure returns (uint256) {
        return RoundMath.crownCost(pot);
    }

    function distribute(uint256 pot, bool decision) external pure returns (RoundMath.Distribution memory) {
        return RoundMath.distribute(pot, decision);
    }
}

contract RoundMathTest is Test {
    RoundMathHarness internal harness = new RoundMathHarness();

    function test_initialDeadlinesAreImmutableOffsets() public view {
        (uint64 softEnd, uint64 hardEnd) = harness.initial(100);
        assertEq(softEnd, 100 + 15 minutes);
        assertEq(hardEnd, 100 + 60 minutes);
    }

    function testFuzz_deadlineIsMonotoneAndCapped(uint64 timestamp, uint64 currentSoftEnd) public view {
        timestamp = uint64(bound(timestamp, 0, type(uint64).max - 60 minutes));
        uint64 hardEnd = timestamp + 60 minutes;
        currentSoftEnd = uint64(bound(currentSoftEnd, timestamp, hardEnd));
        uint64 next = harness.extend(currentSoftEnd, hardEnd, timestamp);
        assertGe(next, currentSoftEnd);
        assertLe(next, hardEnd);
        assertGe(next, timestamp + 5 minutes);
    }

    function test_crownCostClamps() public view {
        assertEq(harness.cost(0), 0.001 ether);
        assertEq(harness.cost(0.1 ether), 0.001 ether);
        assertEq(harness.cost(1 ether), 0.01 ether);
        assertEq(harness.cost(10 ether), 0.1 ether);
        assertEq(harness.cost(100 ether), 0.1 ether);
    }

    function testFuzz_distributionConservesPot(uint256 pot, bool decision) public view {
        pot = bound(pot, 0, type(uint128).max);
        RoundMath.Distribution memory split = harness.distribute(pot, decision);
        assertEq(split.champion + split.crownTime + split.rollover, pot);
        if (decision) assertEq(split.champion, 0);
    }
}
