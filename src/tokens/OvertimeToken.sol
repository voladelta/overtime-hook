// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract OvertimeToken is ERC20 {
    uint256 public constant FIXED_SUPPLY = 1_000_000_000 ether;

    error ZeroMintRecipient();

    constructor(address launcher) ERC20("Overtime", "OVERTIME") {
        if (launcher == address(0)) revert ZeroMintRecipient();
        _mint(launcher, FIXED_SUPPLY);
    }
}
