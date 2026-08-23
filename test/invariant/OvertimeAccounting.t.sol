// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {OvertimeHook} from "../../src/OvertimeHook.sol";
import {OvertimeChallengeRouter} from "../../src/router/OvertimeChallengeRouter.sol";
import {BaseTest} from "../utils/BaseTest.sol";
import {EasyPosm} from "../utils/libraries/EasyPosm.sol";

contract OvertimeHandler {
    MockERC20 public immutable weth;
    OvertimeHook public immutable hook;
    OvertimeChallengeRouter public immutable router;

    uint256 public attempts;
    uint256 public successes;
    uint256 public expectedFailures;
    uint256 public unexpectedFailures;

    constructor(MockERC20 weth_, OvertimeHook hook_, OvertimeChallengeRouter router_) {
        weth = weth_;
        hook = hook_;
        router = router_;
        weth_.approve(address(router_), type(uint256).max);
    }

    function challenge(uint96 rawGross) external {
        ++attempts;
        uint256 gross = 0.01 ether + (uint256(rawGross) % 0.01 ether);
        try router.challenge(gross, 1, block.timestamp, TickMath.MIN_SQRT_PRICE + 1) {
            ++successes;
        } catch (bytes memory reason) {
            if (reason.length >= 4) ++expectedFailures;
            else ++unexpectedFailures;
        }
    }

    function claimRefund() external {
        ++attempts;
        try hook.claimRefund() {
            ++successes;
        } catch (bytes memory reason) {
            if (reason.length >= 4) ++expectedFailures;
            else ++unexpectedFailures;
        }
    }
}

contract OvertimeAccountingInvariantTest is StdInvariant, BaseTest {
    using EasyPosm for IPositionManager;

    OvertimeHook internal hook;
    OvertimeHandler internal handler;

    function setUp() public {
        deployArtifactsAndLabel();
        (Currency currency0, Currency currency1) = deployCurrencyPair();
        MockERC20 weth = MockERC20(Currency.unwrap(currency0));
        MockERC20 overtime = MockERC20(Currency.unwrap(currency1));
        OvertimeChallengeRouter router = new OvertimeChallengeRouter(poolManager, IERC20(address(weth)), address(this));
        address flags = address(uint160(0x20cc) ^ (uint160(0x8989) << 144));
        deployCodeTo(
            "OvertimeHook.sol:OvertimeHook",
            abi.encode(poolManager, address(weth), address(overtime), address(router), address(this)),
            flags
        );
        hook = OvertimeHook(flags);
        router.bind(IERC20(address(overtime)), hook);
        poolManager.initialize(hook.canonicalPoolKey(), Constants.SQRT_PRICE_1_1);

        int24 lower = TickMath.minUsableTick(200);
        int24 upper = TickMath.maxUsableTick(200);
        uint128 liquidity = 10_000 ether;
        (uint256 amount0, uint256 amount1) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1, TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), liquidity
        );
        positionManager.mint(
            hook.canonicalPoolKey(),
            lower,
            upper,
            liquidity,
            amount0 + 1,
            amount1 + 1,
            address(this),
            block.timestamp,
            ""
        );

        handler = new OvertimeHandler(weth, hook, router);
        weth.mint(address(handler), 1_000 ether);
        handler.challenge(0);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = OvertimeHandler.challenge.selector;
        selectors[1] = OvertimeHandler.claimRefund.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_hookClaimsAlwaysBackCategorizedLiabilities() public view {
        assertGe(hook.claimBacking(), hook.unclaimedLiabilities());
        assertEq(hook.unclaimedLiabilities(), hook.totalWethTaken() - hook.totalWethClaimed());
    }

    function invariant_everyActionIsClassifiedExactlyOnce() public view {
        assertEq(handler.attempts(), handler.successes() + handler.expectedFailures() + handler.unexpectedFailures());
        assertEq(handler.unexpectedFailures(), 0);
    }

    function invariant_activeRoundClockIsBounded() public view {
        OvertimeHook.ActiveRound memory round = hook.currentRound();
        if (round.leader != address(0)) {
            assertLt(round.start, round.softEnd);
            assertLe(round.softEnd, round.hardEnd);
            assertEq(round.hardEnd, round.start + 60 minutes);
        }
    }

    function invariant_challengePathSucceeds() public view {
        assertGt(handler.successes(), 0);
    }
}
