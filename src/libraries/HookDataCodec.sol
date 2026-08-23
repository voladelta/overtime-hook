// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library HookDataCodec {
    uint8 internal constant VERSION = 1;
    uint8 internal constant CHALLENGE_MODE = 1;
    uint256 internal constant ENCODED_LENGTH = 192;

    struct ChallengeIntent {
        uint8 version;
        uint8 mode;
        address player;
        uint256 expectedGrossWeth;
        uint256 minTokenOut;
        uint256 deadline;
    }

    error InvalidChallengeEncoding();
    error UnsupportedChallengeMode(uint8 version, uint8 mode);

    function encodeChallenge(address player, uint256 expectedGrossWeth, uint256 minTokenOut, uint256 deadline)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(VERSION, CHALLENGE_MODE, player, expectedGrossWeth, minTokenOut, deadline);
    }

    function decodeChallenge(bytes calldata data) internal pure returns (ChallengeIntent memory intent) {
        if (data.length != ENCODED_LENGTH) revert InvalidChallengeEncoding();
        (intent.version, intent.mode, intent.player, intent.expectedGrossWeth, intent.minTokenOut, intent.deadline) =
            abi.decode(data, (uint8, uint8, address, uint256, uint256, uint256));
        if (intent.version != VERSION || intent.mode != CHALLENGE_MODE) {
            revert UnsupportedChallengeMode(intent.version, intent.mode);
        }
    }
}
