// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {OvertimeHook} from "../../src/OvertimeHook.sol";
import {OvertimeChallengeRouter} from "../../src/router/OvertimeChallengeRouter.sol";
import {BaseTest} from "../utils/BaseTest.sol";
import {EasyPosm} from "../utils/libraries/EasyPosm.sol";

contract HostileWeth is MockERC20 {
    error PayoutRejected();

    address public hook;
    address public payoutRecipient;
    bool public rejectPayout;
    bool public attemptReentry;
    bytes4 public reentryError;

    constructor() MockERC20("Wrapped Ether", "WETH", 18) {}

    function configure(address hook_, address payoutRecipient_, bool rejectPayout_, bool attemptReentry_) external {
        hook = hook_;
        payoutRecipient = payoutRecipient_;
        rejectPayout = rejectPayout_;
        attemptReentry = attemptReentry_;
        reentryError = bytes4(0);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (to == payoutRecipient) {
            if (rejectPayout) revert PayoutRejected();
            if (attemptReentry) {
                (bool success, bytes memory result) = hook.call(abi.encodeCall(OvertimeHook.finalizeExpiredRound, ()));
                if (success || result.length < 4) revert("reentry unexpectedly succeeded");
                bytes4 selector;
                assembly ("memory-safe") {
                    selector := mload(add(result, 0x20))
                }
                reentryError = selector;
            }
        }
        return super.transfer(to, amount);
    }
}

contract OvertimePayoutIntegrationTest is BaseTest {
    using EasyPosm for IPositionManager;

    HostileWeth internal weth;
    MockERC20 internal overtime;
    OvertimeHook internal hook;
    OvertimeChallengeRouter internal router;
    address internal alice = makeAddr("alice");

    function setUp() public {
        deployArtifactsAndLabel();
        address wethAddress = address(0x1000000000000000000000000000000000001000);
        address overtimeAddress = address(0x2000000000000000000000000000000000002000);
        deployCodeTo("OvertimePayout.t.sol:HostileWeth", bytes(""), wethAddress);
        deployCodeTo(
            "solmate/src/test/utils/mocks/MockERC20.sol:MockERC20",
            abi.encode("Overtime", "OVERTIME", uint8(18)),
            overtimeAddress
        );
        weth = HostileWeth(wethAddress);
        overtime = MockERC20(overtimeAddress);
        _fundAndApprove(weth);
        _fundAndApprove(overtime);

        router = new OvertimeChallengeRouter(poolManager, IERC20(address(weth)), address(this));
        address flags = address(uint160(0x20cc) ^ (uint160(0x8888) << 144));
        deployCodeTo(
            "OvertimeHook.sol:OvertimeHook",
            abi.encode(poolManager, address(weth), address(overtime), address(router), address(this)),
            flags
        );
        hook = OvertimeHook(flags);
        router.bind(IERC20(address(overtime)), hook);
        PoolKey memory key = hook.canonicalPoolKey();
        poolManager.initialize(key, Constants.SQRT_PRICE_1_1);

        int24 lower = TickMath.minUsableTick(key.tickSpacing);
        int24 upper = TickMath.maxUsableTick(key.tickSpacing);
        uint128 liquidity = 1_000 ether;
        (uint256 amount0, uint256 amount1) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1, TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), liquidity
        );
        positionManager.mint(key, lower, upper, liquidity, amount0 + 1, amount1 + 1, address(this), block.timestamp, "");

        weth.mint(alice, 100 ether);
        vm.prank(alice);
        weth.approve(address(router), type(uint256).max);
    }

    function test_revertingWethPayoutRestoresClaimAndLiabilityState() public {
        OvertimeHook.FinalizedRound memory round = _finalizeAliceRound();
        uint256 backing = hook.claimBacking();
        uint256 liabilities = hook.unclaimedLiabilities();
        uint256 claimed = hook.totalWethClaimed();
        weth.configure(address(hook), alice, true, false);

        vm.prank(alice);
        vm.expectRevert();
        hook.claimChampionReward(1);

        assertFalse(hook.championClaimed(1));
        assertEq(hook.totalChampionLiability(), round.championPool);
        assertEq(hook.claimBacking(), backing);
        assertEq(hook.unclaimedLiabilities(), liabilities);
        assertEq(hook.totalWethClaimed(), claimed);

        weth.configure(address(hook), alice, false, false);
        vm.prank(alice);
        hook.claimChampionReward(1);
        assertTrue(hook.championClaimed(1));
    }

    function test_reentrantWethCannotEnterAnotherClaimBoundary() public {
        _finalizeAliceRound();
        weth.configure(address(hook), alice, false, true);

        vm.prank(alice);
        hook.claimChampionReward(1);

        assertEq(weth.reentryError(), bytes4(keccak256("ReentrancyGuardReentrantCall()")));
        assertTrue(hook.championClaimed(1));
        assertEq(hook.claimBacking(), hook.unclaimedLiabilities());
    }

    function _finalizeAliceRound() private returns (OvertimeHook.FinalizedRound memory round) {
        vm.prank(alice);
        router.challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
        vm.warp(hook.currentRound().softEnd);
        hook.finalizeExpiredRound();
        round = hook.finalizedRounds(1);
    }

    function _fundAndApprove(MockERC20 token) private {
        token.mint(address(this), 10_000_000 ether);
        token.approve(address(poolSwapRouter), type(uint256).max);
        token.approve(address(permit2), type(uint256).max);
        permit2.approve(address(token), address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(token), address(poolManager), type(uint160).max, type(uint48).max);
    }
}
