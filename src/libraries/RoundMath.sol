// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

library RoundMath {
    uint256 internal constant RATE_DENOMINATOR = 1_000_000;
    uint256 internal constant GAME_RATE = 10_000;
    uint256 internal constant MIN_CROWN_COST = 0.001 ether;
    uint256 internal constant MAX_CROWN_COST = 0.1 ether;

    error ArithmeticOverflow();
    error InvalidRemainder();
    error UnsupportedGrossUp();

    function gameFee(uint256 gross, uint256 priorRemainder) internal pure returns (uint256 fee, uint256 nextRemainder) {
        if (priorRemainder >= RATE_DENOMINATOR) revert InvalidRemainder();
        if (gross > (type(uint256).max - priorRemainder) / GAME_RATE) revert ArithmeticOverflow();

        uint256 numerator = gross * GAME_RATE + priorRemainder;
        fee = numerator / RATE_DENOMINATOR;
        nextRemainder = numerator % RATE_DENOMINATOR;
    }

    function grossUp(uint256 requestedNet, uint256 priorRemainder)
        internal
        pure
        returns (uint256 gross, uint256 fee, uint256 nextRemainder)
    {
        if (priorRemainder >= RATE_DENOMINATOR) revert InvalidRemainder();

        uint256 rateComplement = RATE_DENOMINATOR - GAME_RATE;
        uint256 feeEstimate = Math.mulDiv(requestedNet, GAME_RATE, rateComplement);
        uint256 scaledRemainder = mulmod(requestedNet, GAME_RATE, rateComplement);
        if (scaledRemainder + priorRemainder >= rateComplement) ++feeEstimate;
        if (requestedNet > type(uint256).max - feeEstimate) revert ArithmeticOverflow();

        gross = requestedNet + feeEstimate;
        (fee, nextRemainder) = gameFee(gross, priorRemainder);
        if (gross - fee != requestedNet) revert UnsupportedGrossUp();
    }

    function crownCost(uint256 pot) internal pure returns (uint256 cost) {
        cost = Math.mulDiv(pot, 100, 10_000);
        if (cost < MIN_CROWN_COST) return MIN_CROWN_COST;
        if (cost > MAX_CROWN_COST) return MAX_CROWN_COST;
    }

    function distribution(uint256 pot, bool decision)
        internal
        pure
        returns (uint256 championPool, uint256 crownTimePool, uint256 rollover)
    {
        if (decision) {
            crownTimePool = Math.mulDiv(pot, 90, 100);
        } else {
            championPool = Math.mulDiv(pot, 40, 100);
            crownTimePool = Math.mulDiv(pot, 50, 100);
        }
        rollover = pot - championPool - crownTimePool;
    }

    function proRata(uint256 pool, uint256 secondsHeld, uint256 totalSeconds) internal pure returns (uint256) {
        if (totalSeconds == 0) return 0;
        return Math.mulDiv(pool, secondsHeld, totalSeconds);
    }
}
