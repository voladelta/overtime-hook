// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title Overtime hook-data codec
/// @notice A strict, versioned challenge intent format. Identity becomes trusted only after router authentication.
library HookDataCodec {
    uint8 internal constant VERSION = 1;
    uint8 internal constant CHALLENGE_MODE = 1;
    uint256 internal constant ENCODED_LENGTH = 192;

    struct Challenge {
        address player;
        uint256 expectedGrossWeth;
        uint256 minTokenOut;
        uint256 deadline;
    }

    error InvalidHookDataLength(uint256 actual, uint256 expected);
    error InvalidHookDataMode(uint8 version, uint8 mode);
    error ZeroPlayer();

    function encode(Challenge memory challenge) internal pure returns (bytes memory) {
        if (challenge.player == address(0)) revert ZeroPlayer();
        return abi.encode(
            VERSION,
            CHALLENGE_MODE,
            challenge.player,
            challenge.expectedGrossWeth,
            challenge.minTokenOut,
            challenge.deadline
        );
    }

    function decode(bytes calldata data) internal pure returns (Challenge memory challenge) {
        if (data.length != ENCODED_LENGTH) revert InvalidHookDataLength(data.length, ENCODED_LENGTH);
        uint8 version;
        uint8 mode;
        (version, mode, challenge.player, challenge.expectedGrossWeth, challenge.minTokenOut, challenge.deadline) =
            abi.decode(data, (uint8, uint8, address, uint256, uint256, uint256));
        if (version != VERSION || mode != CHALLENGE_MODE) revert InvalidHookDataMode(version, mode);
        if (challenge.player == address(0)) revert ZeroPlayer();
    }
}
