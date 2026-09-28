// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Test.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SatStake} from "../src/SatStake.sol";
import {SatStakeTestBase} from "./base/SatStakeTestBase.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";
import {MockHostileToken} from "./mocks/MockHostileToken.sol";

/// @notice Reads SatStake's storage from inside a payout. The hostile token calls `capture` from
/// within its own `transfer`, so the values it records are the ones the contract had written by the
/// time the transfer ran. Cheatcodes answer any contract in the test EVM, not only the test itself,
/// which is what makes the ordering observable from here.
contract SettleObserver {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bool public captured;
    uint256 public statusWord;
    uint256 public locked;

    function capture(address satStake, uint256 statusSlot, uint256 lockedSlot) external {
        captured = true;
        statusWord = uint256(VM.load(satStake, bytes32(statusSlot)));
        locked = uint256(VM.load(satStake, bytes32(lockedSlot)));
    }
}

/// @notice Settling a pledge: who may call it, which account the stake reaches for each stored
/// status, when a pledge is not yet settleable, the order of the effects against the payout, and
/// what a failed payout leaves behind.
contract SatStakeSettleTest is SatStakeTestBase {
    uint64 internal constant DURATION = 1 days;
    uint256 internal constant STAKE = 1000;

    MockFiatToken internal usdc;
    MockFiatToken internal cirbtc;
    MockHostileToken internal hostile;

    // Two accounts with no part in any pledge, so that "any account" is shown with callers that
    // hold no role at all.
    address internal stranger = makeAddr("stranger");
    address internal passerby = makeAddr("passerby");

    function setUp() public {
        // A timestamp far from zero, so that a time before a deadline is still a positive number.
        vm.warp(1_700_000_000);

        usdc = new MockFiatToken(6);
        cirbtc = new MockFiatToken(8);
        hostile = new MockHostileToken();

        address[] memory tokens = new address[](3);
        tokens[0] = address(usdc);
        tokens[1] = address(cirbtc);
        tokens[2] = address(hostile);
        satStake = new SatStake(tokens);

        for (uint256 i = 0; i < tokens.length; i++) {
            _fund(tokens[i], staker);
        }
    }

    // ---------------------------------------------------------------------------------------
    // Reaching each status, and calling settle.
    // ---------------------------------------------------------------------------------------

    function _createIn(address token, uint256 amount, uint64 duration) internal returns (uint256 id) {
        vm.prank(staker);
        id = satStake.createPledge(
            token, amount, referee, beneficiary, uint64(block.timestamp + duration), "Ship the demo"
        );
    }

    function _activePledge() internal returns (uint256 id) {
        return _createIn(address(usdc), STAKE, DURATION);
    }

    function _keptPledge() internal returns (uint256 id) {
        id = _activePledge();
        vm.prank(referee);
        satStake.markKept(id);
    }

    function _brokenPledge() internal returns (uint256 id) {
        id = _activePledge();
        vm.prank(referee);
        satStake.markBroken(id);
    }

    /// An Active pledge whose deadline has been reached, by letting the shortest allowed duration
    /// run out rather than by writing a status no sequence could produce.
    function _expiredPledge() internal returns (uint256 id) {
        id = _createIn(address(usdc), STAKE, 60);
        vm.warp(block.timestamp + 60);
    }

    function _settle(address caller, uint256 id) internal {
        vm.prank(caller);
        satStake.settle(id);
    }

    function _status(uint256 id) internal returns (SatStake.Status) {
        return _storedPledge(id).status;
    }

    function _assertStatus(uint256 id, SatStake.Status expected) internal {
        assertEq(uint8(_status(id)), uint8(expected));
    }

    /// Settles `id` as `caller` and checks that the whole stake reached `recipient`, that it came
    /// out of the contract, and that the caller gained nothing by making the call.
    function _assertSettlesTo(address caller, uint256 id, address recipient) internal {
        uint256 amount = _storedPledge(id).amount;
        uint256 recipientBefore = usdc.balanceOf(recipient);
        uint256 callerBefore = usdc.balanceOf(caller);
        uint256 contractBefore = usdc.balanceOf(address(satStake));

        _settle(caller, id);

        assertEq(usdc.balanceOf(recipient), recipientBefore + amount);
        assertEq(usdc.balanceOf(address(satStake)), contractBefore - amount);
        if (caller != recipient) assertEq(usdc.balanceOf(caller), callerBefore);
    }

    // ---------------------------------------------------------------------------------------
    // Who may call settle (LLR-SC-040).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-040
    function test_SC040_revertsWithPledgeNotFoundForAnIdentifierNeverAssigned() public {
        // Before any pledge exists, every identifier is unknown, including the one the first
        // pledge will take.
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, 0));
        _settle(outsider, 0);
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, 1));
        _settle(outsider, 1);

        uint256 id = _keptPledge();
        assertEq(id, 1);

        // One past the last assigned identifier, and far beyond it.
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, 2));
        _settle(outsider, 2);
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, type(uint256).max));
        _settle(outsider, type(uint256).max);
    }

    /// @custom:verifies LLR-SC-040 LLR-SC-041
    function test_SC040_anyAccountMaySettleAndThePayoutIgnoresTheCaller() public {
        // The three parties and three accounts with no connection to the pledge at all.
        address[6] memory callers = [staker, referee, beneficiary, outsider, stranger, passerby];

        for (uint256 i = 0; i < callers.length; i++) {
            _assertSettlesTo(callers[i], _keptPledge(), staker);
            _assertSettlesTo(callers[i], _brokenPledge(), beneficiary);
            _assertSettlesTo(callers[i], _expiredPledge(), beneficiary);
        }
    }

    /// @custom:verifies LLR-SC-040 LLR-SC-041
    function test_SC040_anUnrelatedCallerMaySettleAndReceivesNothing(address caller) public {
        assumeNotForgeAddress(caller);
        // The staker is the recipient here, and the contract pays out of its own balance.
        vm.assume(caller != staker && caller != address(satStake));

        uint256 id = _keptPledge();
        uint256 stakerBefore = usdc.balanceOf(staker);
        uint256 callerBefore = usdc.balanceOf(caller);

        _settle(caller, id);

        assertEq(usdc.balanceOf(staker), stakerBefore + STAKE);
        assertEq(usdc.balanceOf(caller), callerBefore);
        _assertStatus(id, SatStake.Status.SettledToStaker);
    }

    // ---------------------------------------------------------------------------------------
    // The recipient table (LLR-SC-041).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-041 LLR-SC-044
    function test_SC041_aKeptPledgePaysTheStaker() public {
        uint256 id = _keptPledge();
        uint256 stakerBefore = usdc.balanceOf(staker);
        uint256 beneficiaryBefore = usdc.balanceOf(beneficiary);

        _settle(outsider, id);

        assertEq(usdc.balanceOf(staker), stakerBefore + STAKE);
        assertEq(usdc.balanceOf(beneficiary), beneficiaryBefore);
        _assertStatus(id, SatStake.Status.SettledToStaker);
    }

    /// @custom:verifies LLR-SC-041 LLR-SC-044
    function test_SC041_aBrokenPledgePaysTheBeneficiary() public {
        uint256 id = _brokenPledge();
        uint256 stakerBefore = usdc.balanceOf(staker);
        uint256 beneficiaryBefore = usdc.balanceOf(beneficiary);

        _settle(outsider, id);

        assertEq(usdc.balanceOf(beneficiary), beneficiaryBefore + STAKE);
        assertEq(usdc.balanceOf(staker), stakerBefore);
        _assertStatus(id, SatStake.Status.SettledToBeneficiary);
    }

    /// @custom:verifies LLR-SC-041 LLR-SC-042
    function test_SC041_anActivePledgeAtTheDeadlinePaysTheBeneficiary() public {
        uint256 id = _activePledge();
        uint64 deadline = _storedPledge(id).deadline;
        uint256 beneficiaryBefore = usdc.balanceOf(beneficiary);

        // The first second at which no verdict can still arrive.
        vm.warp(deadline);
        _settle(outsider, id);

        assertEq(usdc.balanceOf(beneficiary), beneficiaryBefore + STAKE);
        _assertStatus(id, SatStake.Status.SettledToBeneficiary);
    }

    /// @custom:verifies LLR-SC-041
    function test_SC041_anActivePledgeAfterTheDeadlinePaysTheBeneficiary() public {
        uint256 id = _activePledge();
        uint64 deadline = _storedPledge(id).deadline;
        uint256 beneficiaryBefore = usdc.balanceOf(beneficiary);

        vm.warp(uint256(deadline) + 365 days);
        _settle(outsider, id);

        assertEq(usdc.balanceOf(beneficiary), beneficiaryBefore + STAKE);
        _assertStatus(id, SatStake.Status.SettledToBeneficiary);
    }

    /// The table selects on the stored status alone, so a recorded verdict decides the recipient
    /// however long the pledge then sits unsettled. Without this, a deadline rule applied to a
    /// judged pledge would send a kept promise's stake to the beneficiary.
    /// @custom:verifies LLR-SC-041
    function test_SC041_aRecordedVerdictSettlesTheSameWayAfterTheDeadline() public {
        uint256 kept = _keptPledge();
        uint256 broken = _brokenPledge();
        uint64 deadline = _storedPledge(kept).deadline;

        vm.warp(uint256(deadline) + 30 days);
        _assertSettlesTo(outsider, kept, staker);
        _assertSettlesTo(outsider, broken, beneficiary);

        _assertStatus(kept, SatStake.Status.SettledToStaker);
        _assertStatus(broken, SatStake.Status.SettledToBeneficiary);
    }

    /// Every value the `Status` enum can hold, each reached by a real sequence of calls: the table
    /// of LLR-SC-041 for the three settleable ones, and the two refusals around it.
    /// @custom:verifies LLR-SC-040 LLR-SC-041 LLR-SC-042
    function test_SC041_everyStoredStatusSettlesAsTheTableSays() public {
        // Judged while their deadlines are still ahead, and outliving the warp below.
        uint256 kept = _keptPledge();
        uint256 broken = _brokenPledge();
        uint256 alreadyToStaker = _keptPledge();
        uint256 alreadyToBeneficiary = _brokenPledge();
        uint256 active = _activePledge();
        // Reaches its deadline at the warp, while `active` is still well short of its own.
        uint256 expiring = _createIn(address(usdc), STAKE, 60);

        _settle(outsider, alreadyToStaker);
        _settle(outsider, alreadyToBeneficiary);
        vm.warp(block.timestamp + 60);

        // None: no pledge has ever held the next identifier.
        uint256 never = expiring + 1;
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, never));
        _settle(outsider, never);

        // Active before its deadline.
        _assertStatus(active, SatStake.Status.Active);
        vm.expectRevert(abi.encodeWithSelector(SatStake.NotSettleable.selector, _storedPledge(active).deadline));
        _settle(outsider, active);

        // The two already settled.
        _assertStatus(alreadyToStaker, SatStake.Status.SettledToStaker);
        vm.expectRevert(SatStake.AlreadySettled.selector);
        _settle(outsider, alreadyToStaker);
        _assertStatus(alreadyToBeneficiary, SatStake.Status.SettledToBeneficiary);
        vm.expectRevert(SatStake.AlreadySettled.selector);
        _settle(outsider, alreadyToBeneficiary);

        // The three the table names.
        _assertSettlesTo(outsider, kept, staker);
        _assertStatus(kept, SatStake.Status.SettledToStaker);
        _assertSettlesTo(outsider, broken, beneficiary);
        _assertStatus(broken, SatStake.Status.SettledToBeneficiary);
        _assertSettlesTo(outsider, expiring, beneficiary);
        _assertStatus(expiring, SatStake.Status.SettledToBeneficiary);
    }

    /// @custom:verifies LLR-SC-041
    function test_SC041_settlesOnlyTheNamedPledge() public {
        uint256 first = _keptPledge();
        uint256 second = _keptPledge();
        uint256 third = _brokenPledge();

        _settle(outsider, second);

        _assertStatus(first, SatStake.Status.Kept);
        _assertStatus(second, SatStake.Status.SettledToStaker);
        _assertStatus(third, SatStake.Status.Broken);
        // One stake left the contract, not three.
        assertEq(usdc.balanceOf(address(satStake)), 2 * STAKE);
    }

    /// A settlement writes the status and releases the stake. Everything else, the rest of the
    /// record, the locked total of every other token, and every party's index, must read the same
    /// afterwards, and no identifier may be consumed.
    /// @custom:verifies LLR-SC-041 LLR-SC-043
    function test_SC041_theSettlementChangesTheStatusAndTheLockedTotalAndNothingElse() public {
        uint256 id = _keptPledge();
        uint256 other = _activePledge();
        _createIn(address(cirbtc), 77, DURATION);

        SatStake.Pledge memory before = _storedPledge(id);
        SatStake.Pledge memory otherBefore = _storedPledge(other);
        uint256 lockedBefore = _storedTotalLocked(address(usdc));
        uint256 otherTokenBefore = _storedTotalLocked(address(cirbtc));
        uint256[] memory stakerIdsBefore = _storedPledgeIds(staker);
        uint256[] memory refereeIdsBefore = _storedPledgeIds(referee);
        uint256[] memory beneficiaryIdsBefore = _storedPledgeIds(beneficiary);
        // The caller is a party to nothing, so a settlement that indexed its caller is visible.
        uint256[] memory callerIdsBefore = _storedPledgeIds(outsider);

        vm.warp(block.timestamp + 1);
        _settle(outsider, id);

        SatStake.Pledge memory stored = _storedPledge(id);
        assertEq(uint8(stored.status), uint8(SatStake.Status.SettledToStaker));
        assertEq(stored.staker, before.staker);
        assertEq(stored.token, before.token);
        assertEq(stored.amount, before.amount);
        assertEq(stored.referee, before.referee);
        assertEq(stored.beneficiary, before.beneficiary);
        assertEq(stored.deadline, before.deadline);
        assertEq(stored.createdAt, before.createdAt);
        assertEq(stored.promiseText, before.promiseText);

        assertEq(_storedTotalLocked(address(usdc)), lockedBefore - before.amount);
        assertEq(_storedTotalLocked(address(cirbtc)), otherTokenBefore);
        assertEq(_storedPledgeIds(staker), stakerIdsBefore);
        assertEq(_storedPledgeIds(referee), refereeIdsBefore);
        assertEq(_storedPledgeIds(beneficiary), beneficiaryIdsBefore);
        assertEq(_storedPledgeIds(outsider), callerIdsBefore);

        // The other pledge is untouched in every field, not only in its status, and the next one
        // takes the next identifier.
        _assertSameRecord(other, otherBefore);
        assertEq(_activePledge(), other + 2);
    }

    // ---------------------------------------------------------------------------------------
    // When a pledge is not settleable (LLR-SC-042).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-042
    function test_SC042_revertsForAnActivePledgeOneSecondBeforeTheDeadline() public {
        uint256 id = _activePledge();
        uint64 deadline = _storedPledge(id).deadline;
        uint256 beneficiaryBefore = usdc.balanceOf(beneficiary);

        // The last second at which a verdict could still arrive.
        vm.warp(uint256(deadline) - 1);
        vm.expectRevert(abi.encodeWithSelector(SatStake.NotSettleable.selector, deadline));
        _settle(outsider, id);

        _assertStatus(id, SatStake.Status.Active);
        assertEq(usdc.balanceOf(beneficiary), beneficiaryBefore);
    }

    /// @custom:verifies LLR-SC-042
    function test_SC042_revertsForAnActivePledgeLongBeforeTheDeadline() public {
        uint256 id = _activePledge();
        uint64 deadline = _storedPledge(id).deadline;
        bytes memory notSettleable = abi.encodeWithSelector(SatStake.NotSettleable.selector, deadline);

        // At creation, and part way through the window.
        vm.expectRevert(notSettleable);
        _settle(staker, id);
        vm.warp(block.timestamp + DURATION / 2);
        vm.expectRevert(notSettleable);
        _settle(beneficiary, id);

        _assertStatus(id, SatStake.Status.Active);
    }

    /// @custom:verifies LLR-SC-042
    function test_SC042_revertsWithAlreadySettledAfterEverySettlement() public {
        uint256[3] memory ids = [_keptPledge(), _brokenPledge(), _expiredPledge()];

        for (uint256 i = 0; i < ids.length; i++) {
            _settle(outsider, ids[i]);
            uint256 contractBefore = usdc.balanceOf(address(satStake));

            // Both settled statuses refuse a second payout, to any caller.
            vm.expectRevert(SatStake.AlreadySettled.selector);
            _settle(outsider, ids[i]);
            vm.expectRevert(SatStake.AlreadySettled.selector);
            _settle(staker, ids[i]);
            vm.expectRevert(SatStake.AlreadySettled.selector);
            _settle(beneficiary, ids[i]);

            assertEq(usdc.balanceOf(address(satStake)), contractBefore);
        }
    }

    /// @custom:verifies LLR-SC-041 LLR-SC-042
    function test_SC042_anActivePledgeBecomesSettleableAtTheDeadlineAndNotBefore(uint256 timePick) public {
        uint256 id = _activePledge();
        uint64 deadline = _storedPledge(id).deadline;
        // A range around the deadline narrow enough that the boundary second itself is reached.
        uint256 when = bound(timePick, uint256(deadline) - 60, uint256(deadline) + 60);
        uint256 beneficiaryBefore = usdc.balanceOf(beneficiary);

        vm.warp(when);
        if (when < deadline) {
            vm.expectRevert(abi.encodeWithSelector(SatStake.NotSettleable.selector, deadline));
        }
        _settle(outsider, id);

        if (when < deadline) {
            _assertStatus(id, SatStake.Status.Active);
            assertEq(usdc.balanceOf(beneficiary), beneficiaryBefore);
        } else {
            _assertStatus(id, SatStake.Status.SettledToBeneficiary);
            assertEq(usdc.balanceOf(beneficiary), beneficiaryBefore + STAKE);
        }
    }

    // ---------------------------------------------------------------------------------------
    // Effects before the payout (LLR-SC-043).
    // ---------------------------------------------------------------------------------------

    /// The requirement is about order, not about the end state, so the state is read while the
    /// payout is still running: the hostile token calls the observer from inside its `transfer`,
    /// and the observer reads SatStake's storage from there.
    /// @custom:verifies LLR-SC-043
    function test_SC043_writesTheStatusAndReleasesTheStakeBeforeTheTransfer() public {
        uint256 id = _createIn(address(hostile), STAKE, DURATION);
        vm.prank(referee);
        satStake.markKept(id);
        // A second pledge in the same token, so the locked total falls to a number that is neither
        // its starting value nor zero.
        _createIn(address(hostile), 400, DURATION);
        assertEq(_storedTotalLocked(address(hostile)), STAKE + 400);

        SettleObserver observer = new SettleObserver();
        hostile.setReentry(
            address(observer),
            abi.encodeCall(
                SettleObserver.capture, (address(satStake), _statusSlotOf(id), _totalLockedSlotOf(address(hostile)))
            )
        );

        uint256 stakerBefore = hostile.balanceOf(staker);
        _settle(outsider, id);

        // The observation happened, and it happened inside a transfer that really moved the stake.
        assertTrue(observer.captured());
        assertEq(hostile.reentryCount(), 1);
        assertEq(hostile.balanceOf(staker), stakerBefore + STAKE);

        // Both effects were already in storage while the token held control.
        assertEq(uint8(_statusInWord(observer.statusWord())), uint8(SatStake.Status.SettledToStaker));
        assertEq(observer.locked(), 400);
    }

    // ---------------------------------------------------------------------------------------
    // The payout and its event (LLR-SC-044), and the OpenZeppelin units (LLR-SC-003).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-044
    function test_SC044_transfersTheFullAmountToTheRecipient() public {
        // A stake of an awkward size, so a partial payout is visible.
        uint256 id = _createIn(address(cirbtc), 31_337, DURATION);
        vm.prank(referee);
        satStake.markBroken(id);

        uint256 beneficiaryBefore = cirbtc.balanceOf(beneficiary);
        uint256 contractBefore = cirbtc.balanceOf(address(satStake));
        _settle(outsider, id);

        assertEq(cirbtc.balanceOf(beneficiary), beneficiaryBefore + 31_337);
        assertEq(cirbtc.balanceOf(address(satStake)), contractBefore - 31_337);
    }

    /// @custom:verifies LLR-SC-044
    function test_SC044_emitsPledgeSettledOnceWithTheRecipientAndAmount() public {
        uint256 kept = _createIn(address(usdc), 4242, DURATION);
        vm.prank(referee);
        satStake.markKept(kept);
        uint256 broken = _createIn(address(usdc), 777, DURATION);
        vm.prank(referee);
        satStake.markBroken(broken);

        uint256[2] memory ids = [kept, broken];
        address[2] memory recipients = [staker, beneficiary];
        uint256[2] memory amounts = [uint256(4242), 777];

        for (uint256 i = 0; i < ids.length; i++) {
            vm.recordLogs();
            _settle(outsider, ids[i]);
            Vm.Log[] memory logs = vm.getRecordedLogs();

            // The token's own transfer event comes first; the settlement is the contract's only one.
            uint256 found;
            for (uint256 j = 0; j < logs.length; j++) {
                if (logs[j].emitter != address(satStake)) continue;
                found++;
                assertEq(logs[j].topics.length, 3);
                assertEq(logs[j].topics[0], SatStake.PledgeSettled.selector);
                assertEq(uint256(logs[j].topics[1]), ids[i]);
                assertEq(logs[j].topics[2], bytes32(uint256(uint160(recipients[i]))));
                assertEq(logs[j].data, abi.encode(amounts[i]));
            }
            assertEq(found, 1);
        }
    }

    /// @custom:verifies LLR-SC-003 LLR-SC-044
    function test_SC003_settleRevertsWhenTheTokenReportsFailure() public {
        uint256 id = _createIn(address(hostile), STAKE, DURATION);
        vm.prank(referee);
        satStake.markKept(id);

        hostile.setReturnMode(MockHostileToken.ReturnMode.False);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(hostile)));
        _settle(outsider, id);

        // A plain `transfer` would have taken the token's word for it and settled the pledge.
        _assertStatus(id, SatStake.Status.Kept);
        assertEq(_storedTotalLocked(address(hostile)), STAKE);
    }

    /// @custom:verifies LLR-SC-003
    function test_SC003_settleAcceptsATokenThatReturnsNoValue() public {
        uint256 id = _createIn(address(hostile), STAKE, DURATION);
        vm.prank(referee);
        satStake.markKept(id);

        // Real USDC returns a value, but several deployed tokens return nothing; SafeERC20 treats
        // a non-reverting call to a contract as success.
        hostile.setReturnMode(MockHostileToken.ReturnMode.Nothing);
        uint256 stakerBefore = hostile.balanceOf(staker);
        _settle(outsider, id);

        assertEq(hostile.balanceOf(staker), stakerBefore + STAKE);
        _assertStatus(id, SatStake.Status.SettledToStaker);
    }

    /// @custom:verifies LLR-SC-003
    function test_SC003_revertsWhenTheTokenReentersSettle() public {
        uint256 first = _createIn(address(hostile), STAKE, DURATION);
        uint256 second = _createIn(address(hostile), 400, DURATION);
        vm.prank(referee);
        satStake.markKept(first);
        vm.prank(referee);
        satStake.markKept(second);

        // The reentrant call is a settlement that would be valid but for the guard: a Kept pledge,
        // and a contract holding enough of the token to pay it.
        _assertStatus(second, SatStake.Status.Kept);
        assertEq(hostile.balanceOf(address(satStake)), STAKE + 400);
        hostile.setReentry(address(satStake), abi.encodeCall(SatStake.settle, (second)));

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _settle(outsider, first);

        // Neither settlement happened, and the very same call goes through once it is not nested
        // inside another SatStake call. The revert put the token's armed callback back, so it is
        // disarmed first; otherwise the settlement below would call itself.
        _assertStatus(first, SatStake.Status.Kept);
        _assertStatus(second, SatStake.Status.Kept);
        hostile.setReentry(address(0), "");
        _settle(outsider, second);
        _assertStatus(second, SatStake.Status.SettledToStaker);
    }

    // ---------------------------------------------------------------------------------------
    // A failed transfer (LLR-SC-045).
    // ---------------------------------------------------------------------------------------

    /// The whole state a settlement could touch, captured for comparison across a failed payout.
    struct Snapshot {
        SatStake.Pledge pledge;
        uint256 locked;
        uint256 contractBalance;
        uint256 recipientBalance;
        uint256[] stakerIds;
        uint256[] refereeIds;
        uint256[] beneficiaryIds;
        uint256[] outsiderIds;
    }

    function _snapshot(uint256 id, address recipient) internal returns (Snapshot memory s) {
        s.pledge = _storedPledge(id);
        s.locked = _storedTotalLocked(address(usdc));
        s.contractBalance = usdc.balanceOf(address(satStake));
        s.recipientBalance = usdc.balanceOf(recipient);
        s.stakerIds = _storedPledgeIds(staker);
        s.refereeIds = _storedPledgeIds(referee);
        s.beneficiaryIds = _storedPledgeIds(beneficiary);
        // No pledge names this account, so an index it gained would be new.
        s.outsiderIds = _storedPledgeIds(outsider);
    }

    function _assertUnchanged(uint256 id, address recipient, Snapshot memory s) internal {
        SatStake.Pledge memory p = _storedPledge(id);
        assertEq(uint8(p.status), uint8(s.pledge.status));
        assertEq(p.staker, s.pledge.staker);
        assertEq(p.token, s.pledge.token);
        assertEq(p.amount, s.pledge.amount);
        assertEq(p.referee, s.pledge.referee);
        assertEq(p.beneficiary, s.pledge.beneficiary);
        assertEq(p.deadline, s.pledge.deadline);
        assertEq(p.createdAt, s.pledge.createdAt);
        assertEq(p.promiseText, s.pledge.promiseText);

        assertEq(_storedTotalLocked(address(usdc)), s.locked);
        assertEq(usdc.balanceOf(address(satStake)), s.contractBalance);
        assertEq(usdc.balanceOf(recipient), s.recipientBalance);
        assertEq(_storedPledgeIds(staker), s.stakerIds);
        assertEq(_storedPledgeIds(referee), s.refereeIds);
        assertEq(_storedPledgeIds(beneficiary), s.beneficiaryIds);
        assertEq(_storedPledgeIds(outsider), s.outsiderIds);
    }

    /// @custom:verifies LLR-SC-045
    function test_SC045_aBlockedRecipientLeavesTheSettlementUndone() public {
        uint256[3] memory ids = [_keptPledge(), _brokenPledge(), _expiredPledge()];
        address[3] memory recipients = [staker, beneficiary, beneficiary];

        for (uint256 i = 0; i < ids.length; i++) {
            Snapshot memory before = _snapshot(ids[i], recipients[i]);

            usdc.blocklist(recipients[i]);
            vm.expectRevert(abi.encodeWithSelector(MockFiatToken.Blocklisted.selector, recipients[i]));
            _settle(outsider, ids[i]);
            _assertUnchanged(ids[i], recipients[i], before);

            // With the block lifted the same call settles, so the refusal came from the token.
            usdc.unBlocklist(recipients[i]);
            _assertSettlesTo(outsider, ids[i], recipients[i]);
        }
    }

    /// @custom:verifies LLR-SC-045
    function test_SC045_aPausedTokenLeavesTheSettlementUndone() public {
        uint256 id = _keptPledge();
        Snapshot memory before = _snapshot(id, staker);

        usdc.pause();
        vm.expectRevert(MockFiatToken.TokenPaused.selector);
        _settle(outsider, id);
        _assertUnchanged(id, staker, before);

        usdc.unpause();
        _assertSettlesTo(outsider, id, staker);
    }

    /// @custom:verifies LLR-SC-045
    function test_SC045_aBlockedStakerLeavesTheCreationUndone() public {
        uint256 existing = _keptPledge();
        Snapshot memory before = _snapshot(existing, staker);
        uint256 next = existing + 1;

        usdc.blocklist(staker);
        vm.expectRevert(abi.encodeWithSelector(MockFiatToken.Blocklisted.selector, staker));
        _activePledge();

        // Nothing of the attempted pledge remains, and the pledge that was already there is as it
        // was, including the locked stake behind it.
        _assertStatus(next, SatStake.Status.None);
        _assertUnchanged(existing, staker, before);

        // The identifier was not consumed either.
        usdc.unBlocklist(staker);
        assertEq(_activePledge(), next);
    }

    /// @custom:verifies LLR-SC-045
    function test_SC045_aPausedTokenLeavesTheCreationUndone() public {
        uint256 existing = _keptPledge();
        Snapshot memory before = _snapshot(existing, staker);
        uint256 next = existing + 1;

        usdc.pause();
        vm.expectRevert(MockFiatToken.TokenPaused.selector);
        _activePledge();

        _assertStatus(next, SatStake.Status.None);
        _assertUnchanged(existing, staker, before);

        usdc.unpause();
        assertEq(_activePledge(), next);
    }
}
