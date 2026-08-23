// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {HookDataCodec} from "../../src/libraries/HookDataCodec.sol";

contract HookDataCodecHarness {
    function encode(address player, uint256 gross, uint256 minimum, uint256 deadline)
        external
        pure
        returns (bytes memory)
    {
        return HookDataCodec.encodeChallenge(player, gross, minimum, deadline);
    }

    function decode(bytes calldata data) external pure returns (HookDataCodec.ChallengeIntent memory) {
        return HookDataCodec.decodeChallenge(data);
    }
}

contract HookDataCodecTest is Test {
    HookDataCodecHarness internal codec = new HookDataCodecHarness();

    function test_roundTripsTheVersionedFixedLengthIntent() public view {
        address player = address(0x1234);
        bytes memory encoded = codec.encode(player, 1 ether, 2 ether, 123456);
        assertEq(encoded.length, 192);
        HookDataCodec.ChallengeIntent memory intent = codec.decode(encoded);
        assertEq(intent.version, 1);
        assertEq(intent.mode, 1);
        assertEq(intent.player, player);
        assertEq(intent.expectedGrossWeth, 1 ether);
        assertEq(intent.minTokenOut, 2 ether);
        assertEq(intent.deadline, 123456);
    }

    function test_rejectsMalformedLengthVersionAndMode() public {
        vm.expectRevert(HookDataCodec.InvalidChallengeEncoding.selector);
        codec.decode(hex"01");

        vm.expectRevert(abi.encodeWithSelector(HookDataCodec.UnsupportedChallengeMode.selector, 2, 1));
        codec.decode(abi.encode(uint8(2), uint8(1), address(this), 1 ether, 1, block.timestamp));

        vm.expectRevert(abi.encodeWithSelector(HookDataCodec.UnsupportedChallengeMode.selector, 1, 2));
        codec.decode(abi.encode(uint8(1), uint8(2), address(this), 1 ether, 1, block.timestamp));
    }
}
