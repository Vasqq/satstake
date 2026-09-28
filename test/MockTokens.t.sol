// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";
import {MockFeeToken} from "./mocks/MockFeeToken.sol";
import {MockHostileToken} from "./mocks/MockHostileToken.sol";

/// @notice Target of the hostile token's reentrant call, so that the call can be observed when it
/// is allowed through and bubbled when it reverts.
contract ReentryRecorder {
    /// @notice Raised by `boom` so the caller has something to bubble.
    error Boom();

    uint256 public pings;

    function ping() external {
        pings++;
    }

    function boom() external pure {
        revert Boom();
    }
}

/// @notice The mock tokens that later contract tests rely on (06 section 5): a FiatToken-style
/// token with configurable decimals, an issuer blocklist, and a pause, a token that charges a
/// fee on transfer, and a token that is hostile on transfer.
contract MockTokensTest is Test {
    MockFiatToken internal token;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal spender = makeAddr("spender");

    function setUp() public {
        // This test contract deploys the token and is therefore its issuer.
        token = new MockFiatToken(6);
        token.mint(alice, 1000);
        token.mint(bob, 1000);
        vm.prank(alice);
        token.approve(spender, type(uint256).max);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        vm.prank(from);
        token.transfer(to, amount);
    }

    function _transferFrom(address from, address to, uint256 amount) internal {
        vm.prank(spender);
        token.transferFrom(from, to, amount);
    }

    function _expectBlocklisted(address account) internal {
        vm.expectRevert(abi.encodeWithSelector(MockFiatToken.Blocklisted.selector, account));
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_decimalsAreConfigurable() public {
        assertEq(new MockFiatToken(6).decimals(), 6);
        assertEq(new MockFiatToken(8).decimals(), 8);
        assertEq(new MockFiatToken(0).decimals(), 0);
        assertEq(new MockFiatToken(18).decimals(), 18);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_blocklistRevertsTransfersFromListedAddress() public {
        token.blocklist(alice);
        assertTrue(token.isBlocklisted(alice));

        _expectBlocklisted(alice);
        _transfer(alice, bob, 1);
        _expectBlocklisted(alice);
        _transferFrom(alice, bob, 1);
        // Addresses not on the list are unaffected.
        _transfer(bob, spender, 1);

        token.unBlocklist(alice);
        assertFalse(token.isBlocklisted(alice));
        _transfer(alice, bob, 1);
        _transferFrom(alice, bob, 1);
        assertEq(token.balanceOf(bob), 1001);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_blocklistRevertsTransfersToListedAddress() public {
        token.blocklist(bob);

        _expectBlocklisted(bob);
        _transfer(alice, bob, 1);
        _expectBlocklisted(bob);
        _transferFrom(alice, bob, 1);
        _transfer(alice, spender, 1);

        token.unBlocklist(bob);
        _transfer(alice, bob, 1);
        _transferFrom(alice, bob, 1);
        assertEq(token.balanceOf(bob), 1002);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_pauseRevertsAllTransfers() public {
        token.pause();
        assertTrue(token.paused());

        vm.expectRevert(MockFiatToken.TokenPaused.selector);
        _transfer(alice, bob, 1);
        vm.expectRevert(MockFiatToken.TokenPaused.selector);
        _transferFrom(alice, bob, 1);
        vm.expectRevert(MockFiatToken.TokenPaused.selector);
        _transfer(bob, alice, 1);

        token.unpause();
        assertFalse(token.paused());
        _transfer(alice, bob, 1);
        _transferFrom(alice, bob, 1);
        assertEq(token.balanceOf(bob), 1002);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_onlyIssuerControlsBlocklistAndPause() public {
        assertEq(token.issuer(), address(this));

        vm.startPrank(alice);
        vm.expectRevert(MockFiatToken.NotIssuer.selector);
        token.blocklist(bob);
        vm.expectRevert(MockFiatToken.NotIssuer.selector);
        token.unBlocklist(bob);
        vm.expectRevert(MockFiatToken.NotIssuer.selector);
        token.pause();
        vm.expectRevert(MockFiatToken.NotIssuer.selector);
        token.unpause();
        vm.stopPrank();

        assertFalse(token.isBlocklisted(bob));
        assertFalse(token.paused());
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_approveRevertsWhilePaused() public {
        token.pause();
        vm.expectRevert(MockFiatToken.TokenPaused.selector);
        vm.prank(alice);
        token.approve(bob, 1);

        token.unpause();
        vm.prank(alice);
        token.approve(bob, 1);
        assertEq(token.allowance(alice, bob), 1);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_approveRevertsForBlocklistedOwnerOrSpender() public {
        token.blocklist(alice);
        _expectBlocklisted(alice);
        vm.prank(alice);
        token.approve(bob, 1);
        token.unBlocklist(alice);

        token.blocklist(bob);
        _expectBlocklisted(bob);
        vm.prank(alice);
        token.approve(bob, 1);
        token.unBlocklist(bob);

        vm.prank(alice);
        token.approve(bob, 1);
        assertEq(token.allowance(alice, bob), 1);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_feeTokenChargesAtLeastOneUnit() public {
        // A fee that rounds down would let small transfers through at full value, so a fee-blind
        // caller could pass a test with a small amount.
        MockFeeToken feeToken = new MockFeeToken(100);
        feeToken.mint(alice, 1000);

        vm.prank(alice);
        feeToken.transfer(bob, 1);
        assertEq(feeToken.balanceOf(alice), 999);
        assertEq(feeToken.balanceOf(bob), 0);

        // 1% of 150 is 1.5, rounded up to 2.
        vm.prank(alice);
        feeToken.transfer(bob, 150);
        assertEq(feeToken.balanceOf(alice), 849);
        assertEq(feeToken.balanceOf(bob), 148);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_feeTokenDeliversAmountLessFee() public {
        // 1% fee: the sender loses the full amount and the recipient receives 99% of it.
        MockFeeToken feeToken = new MockFeeToken(100);
        assertEq(feeToken.feeBps(), 100);
        feeToken.mint(alice, 10_000);
        assertEq(feeToken.balanceOf(alice), 10_000);

        vm.prank(alice);
        feeToken.transfer(bob, 1000);
        assertEq(feeToken.balanceOf(alice), 9000);
        assertEq(feeToken.balanceOf(bob), 990);

        vm.prank(alice);
        feeToken.approve(spender, 1000);
        vm.prank(spender);
        feeToken.transferFrom(alice, bob, 1000);
        assertEq(feeToken.balanceOf(alice), 8000);
        assertEq(feeToken.balanceOf(bob), 1980);
    }

    function _hostile() internal returns (MockHostileToken hostile) {
        hostile = new MockHostileToken();
        hostile.mint(alice, 1000);
        vm.prank(alice);
        hostile.approve(spender, 1000);
    }

    // Raw result of a transfer, so that returning nothing can be told apart from returning true.
    function _rawTransfer(MockHostileToken hostile, address from, address to, uint256 value)
        internal
        returns (bool ok, bytes memory returndata)
    {
        vm.prank(from);
        (ok, returndata) = address(hostile).call(abi.encodeCall(IERC20.transfer, (to, value)));
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_hostileTokenReturnsTrueByDefault() public {
        MockHostileToken hostile = _hostile();
        (bool ok, bytes memory returndata) = _rawTransfer(hostile, alice, bob, 100);
        assertTrue(ok);
        assertEq(returndata.length, 32);
        assertTrue(abi.decode(returndata, (bool)));
        assertEq(hostile.balanceOf(alice), 900);
        assertEq(hostile.balanceOf(bob), 100);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_hostileTokenCanReturnFalseAndMoveNothing() public {
        MockHostileToken hostile = _hostile();
        hostile.setReturnMode(MockHostileToken.ReturnMode.False);

        (bool ok, bytes memory returndata) = _rawTransfer(hostile, alice, bob, 100);
        assertTrue(ok);
        assertEq(returndata.length, 32);
        assertFalse(abi.decode(returndata, (bool)));

        vm.prank(spender);
        assertFalse(hostile.transferFrom(alice, bob, 100));

        // A token that reports failure this way moves no balance and spends no allowance.
        assertEq(hostile.balanceOf(alice), 1000);
        assertEq(hostile.balanceOf(bob), 0);
        assertEq(hostile.allowance(alice, spender), 1000);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_hostileTokenCanReturnNoValueAtAll() public {
        MockHostileToken hostile = _hostile();
        hostile.setReturnMode(MockHostileToken.ReturnMode.Nothing);

        (bool ok, bytes memory returndata) = _rawTransfer(hostile, alice, bob, 100);
        assertTrue(ok);
        assertEq(returndata.length, 0);

        vm.prank(spender);
        (ok, returndata) = address(hostile).call(abi.encodeCall(IERC20.transferFrom, (alice, bob, 100)));
        assertTrue(ok);
        assertEq(returndata.length, 0);

        // The balances still move: the token simply says nothing about it.
        assertEq(hostile.balanceOf(alice), 800);
        assertEq(hostile.balanceOf(bob), 200);
        assertEq(hostile.allowance(alice, spender), 900);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_hostileTokenReentersFromTransfer() public {
        MockHostileToken hostile = _hostile();
        ReentryRecorder recorder = new ReentryRecorder();
        hostile.setReentry(address(recorder), abi.encodeCall(ReentryRecorder.ping, ()));

        vm.prank(alice);
        hostile.transfer(bob, 100);
        assertEq(recorder.pings(), 1);
        assertEq(hostile.reentryCount(), 1);

        // The target is spent after one use, so a reentrant call cannot recurse without end.
        vm.prank(alice);
        hostile.transfer(bob, 100);
        assertEq(recorder.pings(), 1);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_hostileTokenReentersFromTransferFrom() public {
        MockHostileToken hostile = _hostile();
        ReentryRecorder recorder = new ReentryRecorder();
        hostile.setReentry(address(recorder), abi.encodeCall(ReentryRecorder.ping, ()));

        vm.prank(spender);
        hostile.transferFrom(alice, bob, 100);
        assertEq(recorder.pings(), 1);
        assertEq(hostile.reentryCount(), 1);
        assertEq(hostile.balanceOf(bob), 100);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_hostileTokenBubblesTheReentrantCallsRevert() public {
        MockHostileToken hostile = _hostile();
        ReentryRecorder recorder = new ReentryRecorder();
        hostile.setReentry(address(recorder), abi.encodeCall(ReentryRecorder.boom, ()));

        // Bubbled rather than swallowed, so the caller sees why the reentrant call was refused.
        vm.expectRevert(ReentryRecorder.Boom.selector);
        vm.prank(alice);
        hostile.transfer(bob, 100);

        vm.expectRevert(ReentryRecorder.Boom.selector);
        vm.prank(spender);
        hostile.transferFrom(alice, bob, 100);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_hostileTokenCanTakeAnAccountsBalanceDuringATransfer() public {
        MockHostileToken hostile = _hostile();
        vm.prank(alice);
        hostile.transfer(bob, 100);

        hostile.setDrain(bob);
        vm.prank(spender);
        hostile.transferFrom(alice, bob, 50);
        // What the recipient held and what has just arrived are both gone, so its balance has
        // fallen across a transfer into it.
        assertEq(hostile.balanceOf(bob), 0);
        assertEq(hostile.balanceOf(address(hostile)), 150);

        // Spent after one use, like the callback.
        vm.prank(alice);
        hostile.transfer(bob, 10);
        assertEq(hostile.balanceOf(bob), 10);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_hostileTokenRefusesATransferItCannotCover() public {
        // Hostile on transfer, but still an ERC-20: it does not create balance or ignore approvals.
        MockHostileToken hostile = _hostile();

        vm.expectRevert(MockHostileToken.InsufficientBalance.selector);
        vm.prank(alice);
        hostile.transfer(bob, 1001);

        vm.expectRevert(MockHostileToken.InsufficientAllowance.selector);
        vm.prank(spender);
        hostile.transferFrom(alice, bob, 1001);

        assertEq(hostile.balanceOf(alice), 1000);
        assertEq(hostile.balanceOf(bob), 0);
    }

    /// @custom:verifies LLR-VV-007
    function test_VV007_hostileTokenDoesNotReenterUnlessAsked() public {
        MockHostileToken hostile = _hostile();
        vm.prank(alice);
        hostile.transfer(bob, 100);
        vm.prank(spender);
        hostile.transferFrom(alice, bob, 100);
        assertEq(hostile.reentryCount(), 0);
        assertEq(hostile.balanceOf(bob), 200);
    }
}
