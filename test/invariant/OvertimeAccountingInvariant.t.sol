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

import { OvertimeChallengeRouter } from "../../src/OvertimeChallengeRouter.sol";
import { OvertimeHook } from "../../src/OvertimeHook.sol";

contract OvertimeInvariantHandler is Test {
    OvertimeHook public immutable hook;
    OvertimeChallengeRouter public immutable router;
    PoolKey internal key;
    address public immutable alice;
    address public immutable bob;

    bool public deadlineViolated;
    bool public resurrectedRound;
    uint256 public largestFinalizedRound;
    uint256 private _observedRound;
    uint64 private _observedSoftEnd;

    constructor(
        OvertimeHook hook_,
        OvertimeChallengeRouter router_,
        PoolKey memory key_,
        address alice_,
        address bob_
    ) {
        hook = hook_;
        router = router_;
        key = key_;
        alice = alice_;
        bob = bob_;
    }

    function challenge(uint96 rawGross, uint32 rawTimeStep, bool useAlice) external {
        vm.warp(block.timestamp + bound(rawTimeStep, 0, 10 minutes));
        uint256 gross = bound(rawGross, 0.01 ether, 2 ether);
        address player = useAlice ? alice : bob;
        vm.prank(player);
        try router.challenge(key, gross, 0, block.timestamp + 1, TickMath.MIN_SQRT_PRICE + 1) { } catch { }
        _observe();
    }

    function finalize(uint32 rawTimeStep) external {
        vm.warp(block.timestamp + bound(rawTimeStep, 0, 20 minutes));
        hook.finalizeExpiredRound();
        _observe();
    }

    function claimRefund(bool useAlice) external {
        address player = useAlice ? alice : bob;
        vm.prank(player);
        try hook.claimRefund() { } catch { }
        _observe();
    }

    function claimRewards(uint32 rawRound, bool useAlice) external {
        uint256 id = bound(rawRound, 1, hook.roundId() == 0 ? 1 : hook.roundId());
        address player = useAlice ? alice : bob;
        vm.startPrank(player);
        try hook.claimChampionReward(id) { } catch { }
        try hook.claimCrownTimeReward(id) { } catch { }
        vm.stopPrank();
        _observe();
    }

    function _observe() private {
        uint256 id = hook.roundId();
        (bool active,, uint64 softEnd,,,,,,) = hook.currentRound();
        if (active) {
            if (id <= largestFinalizedRound) resurrectedRound = true;
            if (id == _observedRound && softEnd < _observedSoftEnd) deadlineViolated = true;
            _observedRound = id;
            _observedSoftEnd = softEnd;
        } else if (id != 0) {
            if (id > largestFinalizedRound) largestFinalizedRound = id;
            _observedRound = id;
            _observedSoftEnd = 0;
        }
    }
}

contract OvertimeAccountingInvariantTest is Test, Deployers {
    uint160 private constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    OvertimeHook internal hook;
    OvertimeChallengeRouter internal router;
    OvertimeInvariantHandler internal handler;
    PoolKey internal overtimeKey;
    address internal alice = makeAddr("invariant-alice");
    address internal bob = makeAddr("invariant-bob");

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();
        router = new OvertimeChallengeRouter(manager, Currency.unwrap(currency0));
        bytes memory args =
            abi.encode(manager, Currency.unwrap(currency0), Currency.unwrap(currency1), address(router), address(this));
        (, bytes32 salt) = HookMiner.find(address(this), FLAGS, type(OvertimeHook).creationCode, args);
        hook = new OvertimeHook{ salt: salt }(
            manager, Currency.unwrap(currency0), Currency.unwrap(currency1), address(router), address(this)
        );
        (overtimeKey,) = initPool(currency0, currency1, IHooks(address(hook)), 0, 200, SQRT_PRICE_1_1);
        modifyLiquidityRouter.modifyLiquidity(
            overtimeKey,
            ModifyLiquidityParams({ tickLower: -200, tickUpper: 200, liquidityDelta: int256(1e27), salt: 0 }),
            ZERO_BYTES
        );

        IERC20 wethToken = IERC20(Currency.unwrap(currency0));
        wethToken.transfer(alice, 1_000_000 ether);
        wethToken.transfer(bob, 1_000_000 ether);
        vm.prank(alice);
        wethToken.approve(address(router), type(uint256).max);
        vm.prank(bob);
        wethToken.approve(address(router), type(uint256).max);

        handler = new OvertimeInvariantHandler(hook, router, overtimeKey, alice, bob);
        targetContract(address(handler));
    }

    function invariant_solvencyAndLiabilityConservation() public view {
        (uint256 backing, uint256 liabilities, bool solvent) = hook.solvencyStatus();
        assertTrue(solvent);
        assertEq(backing, liabilities);
        assertEq(hook.totalWethTaken() - hook.totalWethClaimed(), liabilities);
    }

    function invariant_deadlineMonotonicityAndNoResurrection() public view {
        assertFalse(handler.deadlineViolated());
        assertFalse(handler.resurrectedRound());
        (bool active, uint64 start, uint64 softEnd, uint64 hardEnd,,,,,) = hook.currentRound();
        if (active) {
            assertGe(softEnd, start + 15 minutes);
            assertLe(softEnd, hardEnd);
            assertEq(hardEnd, start + 60 minutes);
        }
    }

    function invariant_crownTimeConservation() public view {
        uint256 current = hook.roundId();
        (bool active, uint64 start, uint64 softEnd,, uint64 leaderSince, address leader,,, uint256 recorded) =
            hook.currentRound();
        uint256 lastFinalized = active ? current - 1 : current;
        for (uint256 id = 1; id <= lastFinalized; ++id) {
            assertEq(hook.crownSeconds(id, alice) + hook.crownSeconds(id, bob), hook.finalizedCrownSeconds(id));
        }
        if (active) {
            uint64 accountingEnd = block.timestamp < softEnd ? uint64(block.timestamp) : softEnd;
            uint256 openSeconds = accountingEnd > leaderSince ? accountingEnd - leaderSince : 0;
            assertTrue(leader == alice || leader == bob);
            assertEq(recorded + openSeconds, accountingEnd - start);
        }
    }
}
