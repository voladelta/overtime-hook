// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Overtime Token
/// @notice Fixed-supply, standard ERC-20 with no privileged post-deployment controls.
contract OvertimeToken is ERC20 {
    uint256 public constant FIXED_SUPPLY = 1_000_000_000 ether;

    error ZeroRecipient();

    constructor(address recipient) ERC20("Overtime", "OVERTIME") {
        if (recipient == address(0)) revert ZeroRecipient();
        _mint(recipient, FIXED_SUPPLY);
    }
}
