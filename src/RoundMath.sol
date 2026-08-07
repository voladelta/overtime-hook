// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title Overtime round mathematics
/// @notice Pure immutable formulas shared by the hook, router previews, and property tests.
library RoundMath {
    uint64 internal constant INITIAL_SOFT_CLOCK = 15 minutes;
    uint64 internal constant OVERTIME_WINDOW = 5 minutes;
    uint64 internal constant HARD_CAP = 60 minutes;

    uint256 internal constant BPS_DENOMINATOR = 10_000;
    uint256 internal constant CROWN_COST_BPS = 50;
    uint256 internal constant MIN_CROWN_COST = 0.001 ether;
    uint256 internal constant MAX_CROWN_COST = 0.05 ether;

    struct Distribution {
        uint256 champion;
        uint256 crownTime;
        uint256 rollover;
    }

    function initialDeadlines(uint64 timestamp) internal pure returns (uint64 softEnd, uint64 hardEnd) {
        softEnd = timestamp + INITIAL_SOFT_CLOCK;
        hardEnd = timestamp + HARD_CAP;
    }

    function extendSoftEnd(uint64 currentSoftEnd, uint64 hardEnd, uint64 timestamp)
        internal
        pure
        returns (uint64 nextSoftEnd)
    {
        uint64 responseEnd = timestamp + OVERTIME_WINDOW;
        nextSoftEnd = currentSoftEnd > responseEnd ? currentSoftEnd : responseEnd;
        if (nextSoftEnd > hardEnd) nextSoftEnd = hardEnd;
    }

    function crownCost(uint256 activePot) internal pure returns (uint256 cost) {
        cost = activePot * CROWN_COST_BPS / BPS_DENOMINATOR;
        if (cost < MIN_CROWN_COST) return MIN_CROWN_COST;
        if (cost > MAX_CROWN_COST) return MAX_CROWN_COST;
    }

    function distribute(uint256 pot, bool decision) internal pure returns (Distribution memory result) {
        if (decision) {
            result.crownTime = pot * 9000 / BPS_DENOMINATOR;
        } else {
            result.champion = pot * 4000 / BPS_DENOMINATOR;
            result.crownTime = pot * 5000 / BPS_DENOMINATOR;
        }
        result.rollover = pot - result.champion - result.crownTime;
    }

    function crownTimeReward(uint256 pool, uint256 holderSeconds, uint256 totalSeconds)
        internal
        pure
        returns (uint256)
    {
        if (holderSeconds == 0 || totalSeconds == 0) return 0;
        return pool * holderSeconds / totalSeconds;
    }
}
