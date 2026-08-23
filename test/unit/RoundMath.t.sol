// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {RoundMath} from "../../src/libraries/RoundMath.sol";

contract RoundMathHarness {
    function fee(uint256 gross, uint256 remainder) external pure returns (uint256, uint256) {
        return RoundMath.gameFee(gross, remainder);
    }

    function grossUp(uint256 net, uint256 remainder) external pure returns (uint256, uint256, uint256) {
        return RoundMath.grossUp(net, remainder);
    }

    function crown(uint256 pot) external pure returns (uint256) {
        return RoundMath.crownCost(pot);
    }

    function split(uint256 pot, bool decision) external pure returns (uint256, uint256, uint256) {
        return RoundMath.distribution(pot, decision);
    }
}

contract RoundMathTest is Test {
    RoundMathHarness internal math = new RoundMathHarness();

    function test_splitVolumeCarriesTheLifetimeRemainder() public view {
        uint256 remainder;
        uint256 splitFee;
        uint256[5] memory amounts = [uint256(1_001), 2_003, 7_777, 19_999, 1 ether + 17];
        uint256 total;
        for (uint256 i; i < amounts.length; ++i) {
            (uint256 fee, uint256 next) = math.fee(amounts[i], remainder);
            splitFee += fee;
            remainder = next;
            total += amounts[i];
        }
        (uint256 combinedFee, uint256 combinedRemainder) = math.fee(total, 0);
        assertEq(splitFee, combinedFee);
        assertEq(remainder, combinedRemainder);
    }

    function testFuzz_grossUpAlwaysReconciles(uint128 net, uint32 rawRemainder) public view {
        uint256 remainder = bound(rawRemainder, 0, 999_999);
        (uint256 gross, uint256 fee, uint256 next) = math.grossUp(net, remainder);
        assertEq(gross - fee, net);
        (uint256 recomputedFee, uint256 recomputedRemainder) = math.fee(gross, remainder);
        assertEq(fee, recomputedFee);
        assertEq(next, recomputedRemainder);
    }

    function test_crownCostClamps() public view {
        assertEq(math.crown(0), 0.001 ether);
        assertEq(math.crown(1 ether), 0.01 ether);
        assertEq(math.crown(20 ether), 0.1 ether);
    }

    function test_distributionsUseExactRemainderAsRollover() public view {
        (uint256 champion, uint256 crownTime, uint256 rollover) = math.split(101, false);
        assertEq(champion, 40);
        assertEq(crownTime, 50);
        assertEq(rollover, 11);
        (champion, crownTime, rollover) = math.split(101, true);
        assertEq(champion, 0);
        assertEq(crownTime, 90);
        assertEq(rollover, 11);
    }
}
