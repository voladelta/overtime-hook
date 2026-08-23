// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {OvertimeHook} from "../../src/OvertimeHook.sol";
import {OvertimeChallengeRouter} from "../../src/router/OvertimeChallengeRouter.sol";
import {BaseTest} from "../utils/BaseTest.sol";
import {EasyPosm} from "../utils/libraries/EasyPosm.sol";

contract OvertimeHookIntegrationTest is BaseTest {
    using EasyPosm for IPositionManager;

    MockERC20 internal weth;
    MockERC20 internal overtime;
    OvertimeHook internal hook;
    OvertimeChallengeRouter internal router;
    PoolKey internal key;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        deployArtifactsAndLabel();
        (Currency currency0, Currency currency1) = deployCurrencyPair();
        weth = MockERC20(Currency.unwrap(currency0));
        overtime = MockERC20(Currency.unwrap(currency1));
        router = new OvertimeChallengeRouter(poolManager, IERC20(address(weth)), address(this));

        address flags = address(uint160(0x20cc) ^ (uint160(0x7676) << 144));
        deployCodeTo(
            "OvertimeHook.sol:OvertimeHook",
            abi.encode(poolManager, address(weth), address(overtime), address(router), address(this)),
            flags
        );
        hook = OvertimeHook(flags);
        router.bind(IERC20(address(overtime)), hook);
        key = hook.canonicalPoolKey();
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

    function test_permissionMaskAndCanonicalPoolAreExact() public view {
        assertEq(uint160(address(hook)) & Hooks.ALL_HOOK_MASK, 0x20cc);
        assertEq(Currency.unwrap(key.currency0), address(weth));
        assertEq(Currency.unwrap(key.currency1), address(overtime));
        assertEq(key.fee, 0);
        assertEq(key.tickSpacing, 200);
        assertEq(address(key.hooks), address(hook));
    }

    function test_allFourOrdinaryQuadrantsAccrueClaimsWithoutChangingRound() public {
        _ordinarySwap(true, -int256(1 ether), TickMath.MIN_SQRT_PRICE + 1);
        _ordinarySwap(true, int256(0.1 ether), TickMath.MIN_SQRT_PRICE + 1);
        _ordinarySwap(false, -int256(0.1 ether), TickMath.MAX_SQRT_PRICE - 1);
        _ordinarySwap(false, int256(0.01 ether), TickMath.MAX_SQRT_PRICE - 1);

        assertGt(hook.pendingPot(), 0);
        assertEq(hook.currentRound().leader, address(0));
        assertEq(hook.claimBacking(), hook.unclaimedLiabilities());
        assertEq(hook.totalWethTaken(), hook.pendingPot());
    }

    function test_splitOrdinaryVolumeEqualsCombinedOnePercentFee() public {
        uint256[4] memory gross = [uint256(1_001), 2_003, 7_777, 1 ether + 19];
        uint256 total;
        for (uint256 i; i < gross.length; ++i) {
            _ordinarySwap(true, -int256(gross[i]), TickMath.MIN_SQRT_PRICE + 1);
            total += gross[i];
        }
        assertEq(hook.totalWethTaken(), (total * 10_000) / 1_000_000);
        assertEq(hook.gameFeeRemainder(), (total * 10_000) % 1_000_000);
        assertEq(hook.claimBacking(), hook.totalWethTaken());
    }

    function test_challengeStartsRoundAndBindsOutputToCaller() public {
        uint256 gross = 1 ether;
        (uint256 fee, uint256 crown, uint256 total) = hook.previewChallenge(gross);
        uint256 wethBefore = weth.balanceOf(alice);

        vm.prank(alice);
        uint256 amountOut = router.challenge(gross, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);

        assertEq(wethBefore - weth.balanceOf(alice), total);
        assertEq(overtime.balanceOf(alice), amountOut);
        OvertimeHook.ActiveRound memory round = hook.currentRound();
        assertEq(round.leader, alice);
        assertEq(round.activePot, fee + crown);
        assertEq(round.softEnd, block.timestamp + 15 minutes);
        assertEq(round.hardEnd, block.timestamp + 60 minutes);
        assertEq(hook.claimBacking(), fee + crown);
    }

    function test_sameBlockDisplacementCreditsPullRefundAndPreservesSolvency() public {
        weth.mint(bob, 100 ether);
        vm.prank(bob);
        weth.approve(address(router), type(uint256).max);
        vm.prank(alice);
        router.challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
        uint256 contribution = hook.currentRound().leaderContribution;

        vm.prank(bob);
        router.challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
        assertEq(hook.crownSeconds(1, alice), 0);
        assertEq(hook.refundCredit(alice), contribution);
        assertEq(hook.claimBacking(), hook.unclaimedLiabilities());

        uint256 before = weth.balanceOf(alice);
        vm.prank(alice);
        hook.claimRefund();
        assertEq(weth.balanceOf(alice) - before, contribution);
        assertEq(hook.refundCredit(alice), 0);
        assertEq(hook.claimBacking(), hook.unclaimedLiabilities());
    }

    function test_knockoutFinalizationAndClaimsAreConstantTime() public {
        vm.prank(alice);
        router.challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
        OvertimeHook.ActiveRound memory active = hook.currentRound();
        vm.warp(active.softEnd);
        hook.finalizeExpiredRound();

        OvertimeHook.FinalizedRound memory round = hook.finalizedRounds(1);
        assertFalse(round.decision);
        assertEq(round.champion, alice);
        assertEq(round.totalCrownSeconds, 15 minutes);
        uint256 before = weth.balanceOf(alice);
        vm.startPrank(alice);
        hook.claimChampionReward(1);
        hook.claimCrownTimeReward(1);
        vm.stopPrank();
        assertEq(weth.balanceOf(alice) - before, round.championPool + round.crownTimePool);
        assertEq(hook.claimBacking(), hook.unclaimedLiabilities());
    }

    function test_expiredRoundFinalizesBeforeOrdinarySwapFundsPendingPot() public {
        vm.prank(alice);
        router.challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
        vm.warp(hook.currentRound().softEnd);
        _ordinarySwap(true, -int256(1 ether), TickMath.MIN_SQRT_PRICE + 1);
        assertTrue(hook.finalizedRounds(1).finalized);
        assertEq(hook.currentRound().leader, address(0));
        assertGt(hook.pendingPot(), 0);
    }

    function test_ordinarySwapNeverChangesLeaderOrDeadlines() public {
        vm.prank(alice);
        router.challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
        OvertimeHook.ActiveRound memory beforeSwap = hook.currentRound();
        _ordinarySwap(false, -int256(0.1 ether), TickMath.MAX_SQRT_PRICE - 1);
        OvertimeHook.ActiveRound memory afterSwap = hook.currentRound();
        assertEq(afterSwap.leader, beforeSwap.leader);
        assertEq(afterSwap.leaderSince, beforeSwap.leaderSince);
        assertEq(afterSwap.softEnd, beforeSwap.softEnd);
        assertEq(afterSwap.hardEnd, beforeSwap.hardEnd);
        assertGt(afterSwap.activePot, beforeSwap.activePot);
    }

    function test_repeatedChallengesExtendToAnImmutableDecisionDeadline() public {
        vm.prank(alice);
        router.challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
        uint64 hardEnd = hook.currentRound().hardEnd;
        while (hook.currentRound().softEnd < hardEnd) {
            uint64 priorSoftEnd = hook.currentRound().softEnd;
            vm.warp(priorSoftEnd - 1);
            vm.roll(block.number + 1);
            vm.prank(alice);
            router.challenge(0.01 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
            assertGe(hook.currentRound().softEnd, priorSoftEnd);
            assertLe(hook.currentRound().softEnd, hardEnd);
        }
        assertEq(hook.currentRound().softEnd, hardEnd);
        vm.warp(hardEnd);
        hook.finalizeExpiredRound();
        OvertimeHook.FinalizedRound memory round = hook.finalizedRounds(1);
        assertTrue(round.decision);
        assertEq(round.championPool, 0);
        assertEq(round.crownTimePool, hook.totalCrownTimeLiability());
    }

    function test_threeSameBlockChallengesAndSelfChallengeRefundEachDisplacedContribution() public {
        weth.mint(bob, 100 ether);
        vm.prank(bob);
        weth.approve(address(router), type(uint256).max);
        vm.prank(alice);
        router.challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
        uint256 firstContribution = hook.currentRound().leaderContribution;
        vm.prank(bob);
        router.challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
        uint256 secondContribution = hook.currentRound().leaderContribution;
        vm.prank(bob);
        router.challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);

        assertEq(hook.refundCredit(alice), firstContribution);
        assertEq(hook.refundCredit(bob), secondContribution);
        assertEq(hook.crownSeconds(1, alice), 0);
        assertEq(hook.crownSeconds(1, bob), 0);
        assertEq(hook.claimBacking(), hook.unclaimedLiabilities());
    }

    function test_challengeMinimumDeadlineSlippageAndFullFillRollback() public {
        vm.startPrank(alice);
        vm.expectRevert(OvertimeHook.InvalidChallengeAmount.selector);
        router.challenge(0.009 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);

        vm.expectRevert();
        router.challenge(0.01 ether, 1, block.timestamp - 1, TickMath.MIN_SQRT_PRICE + 1);

        vm.expectRevert();
        router.challenge(1 ether, type(uint128).max, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);

        vm.expectRevert();
        router.challenge(1 ether, 1, block.timestamp, Constants.SQRT_PRICE_1_1 - 1);
        vm.stopPrank();

        assertEq(hook.latestRoundId(), 0);
        assertEq(hook.totalWethTaken(), 0);
        assertEq(hook.claimBacking(), 0);
    }

    function test_specifiedWethPartialFillRollsBackFeeAndRemainder() public {
        vm.expectRevert();
        _ordinarySwap(true, -int256(1 ether), Constants.SQRT_PRICE_1_1 - 1);
        assertEq(hook.totalWethTaken(), 0);
        assertEq(hook.pendingPot(), 0);
        assertEq(hook.gameFeeRemainder(), 0);
        assertEq(hook.claimBacking(), 0);
    }

    function test_doubleClaimsRevertWithoutReducingBacking() public {
        vm.prank(alice);
        router.challenge(1 ether, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1);
        vm.warp(hook.currentRound().softEnd);
        hook.finalizeExpiredRound();
        vm.startPrank(alice);
        hook.claimChampionReward(1);
        uint256 backing = hook.claimBacking();
        vm.expectRevert(OvertimeHook.AlreadyClaimed.selector);
        hook.claimChampionReward(1);
        hook.claimCrownTimeReward(1);
        backing = hook.claimBacking();
        vm.expectRevert(OvertimeHook.AlreadyClaimed.selector);
        hook.claimCrownTimeReward(1);
        vm.stopPrank();
        assertEq(hook.claimBacking(), backing);
    }

    function test_directCallbackAndWrongInitializerAreRejected() public {
        vm.expectRevert();
        hook.beforeSwap(address(this), key, SwapParams(true, -int256(1 ether), TickMath.MIN_SQRT_PRICE + 1), "");

        PoolKey memory wrong = key;
        wrong.tickSpacing = 201;
        vm.expectRevert();
        poolManager.initialize(wrong, Constants.SQRT_PRICE_1_1);
    }

    function _ordinarySwap(bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96)
        private
        returns (BalanceDelta)
    {
        return poolSwapRouter.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne, amountSpecified: amountSpecified, sqrtPriceLimitX96: sqrtPriceLimitX96
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }
}
