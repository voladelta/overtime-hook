// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Deployers } from "@uniswap/v4-core/test/utils/Deployers.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { ModifyLiquidityParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { HookMiner } from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import { OvertimeChallengeRouter } from "../src/OvertimeChallengeRouter.sol";
import { OvertimeHook } from "../src/OvertimeHook.sol";

contract OvertimeGameTest is Test, Deployers {
    uint160 private constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    OvertimeHook internal hook;
    OvertimeChallengeRouter internal challengeRouter;
    PoolKey internal overtimeKey;
    IERC20 internal wethToken;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();
        wethToken = IERC20(Currency.unwrap(currency0));
        challengeRouter = new OvertimeChallengeRouter(manager, Currency.unwrap(currency0));

        bytes memory constructorArgs = abi.encode(
            manager, Currency.unwrap(currency0), Currency.unwrap(currency1), address(challengeRouter), address(this)
        );
        (, bytes32 salt) = HookMiner.find(address(this), FLAGS, type(OvertimeHook).creationCode, constructorArgs);
        hook = new OvertimeHook{ salt: salt }(
            manager, Currency.unwrap(currency0), Currency.unwrap(currency1), address(challengeRouter), address(this)
        );
        (overtimeKey,) = initPool(currency0, currency1, IHooks(address(hook)), 0, 200, SQRT_PRICE_1_1);
        modifyLiquidityRouter.modifyLiquidity(
            overtimeKey,
            ModifyLiquidityParams({ tickLower: -200, tickUpper: 200, liquidityDelta: int256(1e25), salt: bytes32(0) }),
            ZERO_BYTES
        );

        wethToken.transfer(alice, 10_000 ether);
        wethToken.transfer(bob, 100 ether);
        vm.prank(alice);
        wethToken.approve(address(challengeRouter), type(uint256).max);
        vm.prank(bob);
        wethToken.approve(address(challengeRouter), type(uint256).max);
    }

    function test_firstChallengeStartsRoundWithImmutableDeadlines() public {
        uint256 start = block.timestamp;
        _challenge(alice, 1 ether);

        (
            bool active,
            uint64 roundStart,
            uint64 softEnd,
            uint64 hardEnd,
            uint64 leaderSince,
            address leader,
            uint256 activePot,
            uint256 contribution,
            uint256 totalSeconds
        ) = hook.currentRound();
        assertTrue(active);
        assertEq(roundStart, start);
        assertEq(softEnd, start + 15 minutes);
        assertEq(hardEnd, start + 60 minutes);
        assertEq(leaderSince, start);
        assertEq(leader, alice);
        assertEq(activePot, 0.011 ether);
        assertEq(contribution, 0.001 ether);
        assertEq(totalSeconds, 0);
        assertEq(hook.roundId(), 1);
        _assertSolvent();
    }

    function test_ordinarySwapNeverChangesLeaderOrDeadline() public {
        _challenge(alice, 1 ether);
        (,, uint64 softBefore,, uint64 sinceBefore, address leaderBefore,,,) = hook.currentRound();
        vm.warp(block.timestamp + 4 minutes);
        swap(overtimeKey, false, -int256(0.1 ether), ZERO_BYTES);
        (,, uint64 softAfter,, uint64 sinceAfter, address leaderAfter,,,) = hook.currentRound();
        assertEq(softAfter, softBefore);
        assertEq(sinceAfter, sinceBefore);
        assertEq(leaderAfter, leaderBefore);
    }

    function test_challengeCreditsCrownSecondsAndExtendsMonotonically() public {
        uint256 start = block.timestamp;
        _challenge(alice, 1 ether);
        vm.warp(start + 14 minutes);
        _challenge(bob, 1 ether);

        (,, uint64 softEnd, uint64 hardEnd, uint64 leaderSince, address leader,,,) = hook.currentRound();
        assertEq(hook.crownSeconds(1, alice), 14 minutes);
        assertEq(softEnd, start + 19 minutes);
        assertLe(softEnd, hardEnd);
        assertEq(leaderSince, start + 14 minutes);
        assertEq(leader, bob);
        _assertSolvent();
    }

    function test_sameBlockDisplacementCreditsPullRefund() public {
        _challenge(alice, 1 ether);
        _challenge(bob, 1 ether);

        assertEq(hook.refundCredit(alice), 0.001 ether);
        assertEq(hook.totalRefundLiability(), 0.001 ether);
        assertEq(hook.crownSeconds(1, alice), 0);
        (,,,,, address leader, uint256 activePot,,) = hook.currentRound();
        assertEq(leader, bob);
        assertEq(activePot, 0.021 ether);

        uint256 before = wethToken.balanceOf(alice);
        vm.prank(alice);
        hook.claimRefund();
        assertEq(wethToken.balanceOf(alice) - before, 0.001 ether);
        assertEq(hook.refundCredit(alice), 0);
        assertEq(hook.claimedRefunds(), 0.001 ether);
        _assertSolvent();
    }

    function test_knockoutConservesPotAndClaimsArePullBased() public {
        _challenge(alice, 1 ether);
        (,, uint64 softEnd,,,,,,) = hook.currentRound();
        vm.warp(softEnd);
        assertTrue(hook.finalizeExpiredRound());

        assertEq(hook.roundChampion(1), alice);
        assertFalse(hook.roundWasDecision(1));
        assertEq(hook.championPool(1), 0.0044 ether);
        assertEq(hook.crownTimePool(1), 0.0055 ether);
        assertEq(hook.pendingPot(), 0.0011 ether);
        assertEq(hook.finalizedCrownSeconds(1), 15 minutes);

        uint256 before = wethToken.balanceOf(alice);
        vm.startPrank(alice);
        hook.claimChampionReward(1);
        hook.claimCrownTimeReward(1);
        vm.stopPrank();
        assertEq(wethToken.balanceOf(alice) - before, 0.0099 ether);
        assertEq(hook.claimedChampionRewards(), 0.0044 ether);
        assertEq(hook.claimedCrownTimeRewards(), 0.0055 ether);
        _assertSolvent();
    }

    function test_doubleCrownTimeClaimReverts() public {
        _challenge(alice, 1 ether);
        (,, uint64 softEnd,,,,,,) = hook.currentRound();
        vm.warp(softEnd);
        hook.finalizeExpiredRound();
        vm.startPrank(alice);
        hook.claimCrownTimeReward(1);
        vm.expectRevert();
        hook.claimCrownTimeReward(1);
        vm.stopPrank();
    }

    function test_postExpiryChallengeFinalizesThenStartsNextRound() public {
        _challenge(alice, 1 ether);
        (,, uint64 softEnd,,,,,,) = hook.currentRound();
        vm.warp(softEnd);
        _challenge(bob, 1 ether);

        assertEq(hook.roundId(), 2);
        assertEq(hook.roundChampion(1), alice);
        (bool active, uint64 start,,,, address leader,,,) = hook.currentRound();
        assertTrue(active);
        assertEq(start, softEnd);
        assertEq(leader, bob);
        _assertSolvent();
    }

    function test_hardCapDecisionHasNoChampionAndNinetyPercentCrownTime() public {
        uint256 start = block.timestamp;
        _challenge(alice, 0.1 ether);
        while (true) {
            (,, uint64 softEnd, uint64 hardEnd,,,,,) = hook.currentRound();
            if (softEnd == hardEnd) {
                vm.warp(hardEnd);
                break;
            }
            vm.warp(softEnd - 1 minutes);
            (,,,,, address leader,,,) = hook.currentRound();
            _challenge(leader == alice ? bob : alice, 0.1 ether);
        }
        (,,,,,, uint256 pot,,) = hook.currentRound();
        hook.finalizeExpiredRound();

        assertTrue(hook.roundWasDecision(1));
        assertEq(hook.championPool(1), 0);
        assertEq(hook.crownTimePool(1), pot * 9000 / 10_000);
        assertEq(hook.pendingPot(), pot - hook.crownTimePool(1));
        assertEq(hook.finalizedCrownSeconds(1), 60 minutes);
        assertEq(hook.crownSeconds(1, alice) + hook.crownSeconds(1, bob), 60 minutes);
        assertEq(block.timestamp, start + 60 minutes);
        _assertSolvent();
    }

    function test_routerBindsPlayerBeneficiaryAndTokenRecipient() public {
        uint256 aliceTokenBefore = IERC20(Currency.unwrap(currency1)).balanceOf(alice);
        uint256 out = _challenge(alice, 1 ether);
        assertEq(IERC20(Currency.unwrap(currency1)).balanceOf(alice) - aliceTokenBefore, out);
        assertEq(IERC20(Currency.unwrap(currency1)).balanceOf(address(challengeRouter)), 0);
        (,,,,, address leader,,,) = hook.currentRound();
        assertEq(leader, alice);
    }

    function test_challengePartialFillRevertsAtomically() public {
        uint256 aliceBefore = wethToken.balanceOf(alice);
        vm.prank(alice);
        vm.expectRevert();
        challengeRouter.challenge(overtimeKey, 5000 ether, 0, block.timestamp + 1, TickMath.getSqrtPriceAtTick(-1));
        assertEq(wethToken.balanceOf(alice), aliceBefore);
        assertEq(hook.roundId(), 0);
        assertEq(hook.totalWethTaken(), 0);
    }

    function test_wrongCallbackSenderCannotForgePlayer() public {
        bytes memory forged = abi.encode(uint8(1), uint8(1), bob, 1 ether, 0, block.timestamp + 1);
        vm.expectRevert();
        swap(overtimeKey, true, -int256(1.001 ether), forged);
        assertEq(hook.roundId(), 0);
    }

    function _challenge(address player, uint256 grossWeth) private returns (uint256 tokenOut) {
        vm.prank(player);
        tokenOut =
            challengeRouter.challenge(overtimeKey, grossWeth, 1, block.timestamp + 1, TickMath.MIN_SQRT_PRICE + 1);
    }

    function _assertSolvent() private view {
        uint256 backing = manager.balanceOf(address(hook), uint256(uint160(Currency.unwrap(currency0))));
        assertEq(backing, hook.totalUnclaimedLiabilities());
        assertEq(hook.totalWethTaken() - hook.totalWethClaimed(), hook.totalUnclaimedLiabilities());
    }
}
