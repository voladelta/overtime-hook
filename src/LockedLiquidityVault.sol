// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IPositionManager } from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

/// @title Locked Liquidity Vault
/// @notice Permanent sink for one initial Uniswap v4 position and all launch dust.
/// @dev Deliberately exposes no approval, transfer, liquidity-decrease, withdrawal, rescue, receive, or fallback path.
contract LockedLiquidityVault {
    IPositionManager public immutable positionManager;
    uint256 public immutable positionTokenId;

    error InvalidPositionManager();

    constructor(IPositionManager positionManager_, uint256 positionTokenId_) {
        if (address(positionManager_) == address(0) || positionTokenId_ == 0) revert InvalidPositionManager();
        positionManager = positionManager_;
        positionTokenId = positionTokenId_;
    }

    function positionIsLocked() external view returns (bool) {
        return IERC721(address(positionManager)).ownerOf(positionTokenId) == address(this);
    }
}
