// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

interface IERC721Owner {
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract LockedLiquidityVault {
    IPositionManager public immutable positionManager;
    uint256 public immutable tokenId;

    constructor(IPositionManager positionManager_, uint256 tokenId_) {
        positionManager = positionManager_;
        tokenId = tokenId_;
    }

    function isLocked() external view returns (bool) {
        return IERC721Owner(address(positionManager)).ownerOf(tokenId) == address(this);
    }
}
