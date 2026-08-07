// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Deployers } from "@uniswap/v4-core/test/utils/Deployers.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { ModifyLiquidityParams, SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolSwapTest } from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import { HookMiner } from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import { OvertimeHook } from "../src/OvertimeHook.sol";

contract OvertimeFeeKernelTest is Test, Deployers {
    uint160 private constant FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    OvertimeHook internal hook;
    PoolKey internal overtimeKey;

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        bytes memory constructorArgs =
            abi.encode(manager, Currency.unwrap(currency0), Currency.unwrap(currency1), address(0xBEEF), address(this));
        (address expectedHook, bytes32 salt) =
            HookMiner.find(address(this), FLAGS, type(OvertimeHook).creationCode, constructorArgs);
        hook = new OvertimeHook{ salt: salt }(
            manager, Currency.unwrap(currency0), Currency.unwrap(currency1), address(0xBEEF), address(this)
        );
        assertEq(address(hook), expectedHook);
        assertEq(uint160(address(hook)) & Hooks.ALL_HOOK_MASK, FLAGS);

        (overtimeKey,) = initPool(currency0, currency1, IHooks(address(hook)), 0, 200, SQRT_PRICE_1_1);
        modifyLiquidityRouter.modifyLiquidity(
            overtimeKey,
            ModifyLiquidityParams({ tickLower: -200, tickUpper: 200, liquidityDelta: int256(1e24), salt: bytes32(0) }),
            ZERO_BYTES
        );
    }

    function test_permissionMaskIsExactly20cc() public view {
        assertEq(FLAGS, 0x20cc);
        assertEq(uint160(address(hook)) & Hooks.ALL_HOOK_MASK, 0x20cc);
    }

    function test_exactInputBuyChargesGrossWethBeforeSwap() public {
        uint256 gross = 1 ether;
        BalanceDelta delta = swap(overtimeKey, true, -int256(gross), ZERO_BYTES);

        assertEq(hook.totalGrossQuoteVolume(), gross);
        assertEq(hook.programmableFeeLiability(), gross / 1000);
        assertEq(hook.pendingPot(), gross / 100);
        assertEq(_absolute(delta.amount0()), gross);
        _assertSolvent();
    }

    function test_exactOutputBuyChargesActualGrossWethAfterSwap() public {
        BalanceDelta delta = swap(overtimeKey, true, int256(0.1 ether), ZERO_BYTES);
        uint256 grossWeth = _absolute(delta.amount0());

        assertEq(hook.totalGrossQuoteVolume(), grossWeth);
        assertEq(hook.programmableFeeLiability(), grossWeth * 1000 / 1_000_000);
        assertEq(hook.pendingPot(), grossWeth * 10_000 / 1_000_000);
        _assertSolvent();
    }

    function test_exactInputSellChargesActualGrossWethAfterSwap() public {
        BalanceDelta delta = swap(overtimeKey, false, -int256(0.1 ether), ZERO_BYTES);
        uint256 grossWeth = _absolute(delta.amount0()) + hook.totalFeesAccrued();

        assertEq(hook.totalGrossQuoteVolume(), grossWeth);
        assertEq(hook.programmableFeeLiability(), grossWeth * 1000 / 1_000_000);
        assertEq(hook.pendingPot(), grossWeth * 10_000 / 1_000_000);
        _assertSolvent();
    }

    function test_exactOutputSellGrossesUpRequestedNetWethBeforeSwap() public {
        uint256 netWeth = 0.1 ether;
        BalanceDelta delta = swap(overtimeKey, false, int256(netWeth), ZERO_BYTES);
        uint256 grossWeth = hook.totalGrossQuoteVolume();

        assertEq(_absolute(delta.amount0()), netWeth);
        assertEq(grossWeth - hook.totalFeesAccrued(), netWeth);
        assertEq(hook.programmableFeeLiability(), grossWeth * 1000 / 1_000_000);
        assertEq(hook.pendingPot(), grossWeth * 10_000 / 1_000_000);
        _assertSolvent();
    }

    function test_cumulativeProgrammableFeeIsExactlyTenBpsAcrossQuadrants() public {
        swap(overtimeKey, true, -int256(0.2 ether), ZERO_BYTES);
        swap(overtimeKey, true, int256(0.05 ether), ZERO_BYTES);
        swap(overtimeKey, false, -int256(0.04 ether), ZERO_BYTES);
        swap(overtimeKey, false, int256(0.03 ether), ZERO_BYTES);

        uint256 gross = hook.totalGrossQuoteVolume();
        assertEq(hook.programmableFeeLiability(), gross * 1000 / 1_000_000);
        assertEq(hook.programmableFeeRemainder(), mulmod(gross, 1000, 1_000_000));
        assertEq(hook.pendingPot(), gross * 10_000 / 1_000_000);
        assertEq(hook.gameFeeRemainder(), mulmod(gross, 10_000, 1_000_000));
        _assertSolvent();
    }

    function test_specifiedWethPartialFillRevertsAtomically() public {
        SwapParams memory params = SwapParams({
            zeroForOne: true, amountSpecified: -int256(100 ether), sqrtPriceLimitX96: TickMath.getSqrtPriceAtTick(-1)
        });
        vm.expectRevert();
        swapRouter.swap(
            overtimeKey, params, PoolSwapTest.TestSettings({ takeClaims: false, settleUsingBurn: false }), ZERO_BYTES
        );
        assertEq(hook.totalGrossQuoteVolume(), 0);
        assertEq(hook.totalFeesAccrued(), 0);
    }

    function test_nonEmptyHookDataNeverBecomesOrdinaryTrade() public {
        vm.expectRevert();
        swap(overtimeKey, true, -int256(0.1 ether), hex"01");
        assertEq(hook.totalGrossQuoteVolume(), 0);
    }

    function test_quoteGrossFeesCarriesIndependentRemainders() public view {
        (uint256 total, uint256 game, uint256 programmable) = hook.quoteGrossFees(1999);
        assertEq(programmable, 1);
        assertEq(game, 19);
        assertEq(total, 20);
    }

    function test_poolKeyIsolationRejectsDifferentTickSpacing() public {
        PoolKey memory wrongKey = overtimeKey;
        wrongKey.tickSpacing = 100;
        vm.expectRevert();
        manager.initialize(wrongKey, SQRT_PRICE_1_1);
        assertEq(hook.totalGrossQuoteVolume(), 0);
    }

    function test_programmableOwnerClaimPreservesRemaindersAndPaysChosenRecipient() public {
        swap(overtimeKey, true, -int256(1 ether + 1), ZERO_BYTES);
        uint256 remainder = hook.programmableFeeRemainder();
        uint256 amount = hook.programmableFeeLiability();
        address recipient = makeAddr("programmableRecipient");
        uint256 before = IERC20(Currency.unwrap(currency0)).balanceOf(recipient);

        vm.prank(hook.PROGRAMMABLE_FEE_OWNER());
        hook.claimProgrammableFees(recipient);
        assertEq(IERC20(Currency.unwrap(currency0)).balanceOf(recipient) - before, amount);
        assertEq(hook.programmableFeeLiability(), 0);
        assertEq(hook.programmableFeeRemainder(), remainder);
        assertEq(hook.claimedProgrammableFees(), amount);
        _assertSolvent();
    }

    function _assertSolvent() private view {
        uint256 claimBalance = manager.balanceOf(address(hook), uint256(uint160(Currency.unwrap(currency0))));
        assertEq(claimBalance, hook.totalUnclaimedLiabilities());
        assertEq(hook.totalWethTaken() - hook.totalWethClaimed(), hook.totalUnclaimedLiabilities());
    }

    function _absolute(int128 value) private pure returns (uint256) {
        return uint256(uint128(value < 0 ? -value : value));
    }
}
