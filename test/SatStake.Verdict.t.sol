// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Test.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SatStake} from "../src/SatStake.sol";
import {SatStakeTestBase} from "./base/SatStakeTestBase.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";
import {MockHostileToken} from "./mocks/MockHostileToken.sol";

/// @notice Recording a verdict: who may record one, on which pledges, until when, and what a
/// recorded verdict leaves behind. Every rule is exercised against both `markKept` and
/// `markBroken`, which 05 states as one requirement each.
contract SatStakeVerdictTest is SatStakeTestBase {
    uint64 internal constant DURATION = 1 days;

    MockFiatToken internal usdc;
    MockHostileToken internal hostile;

    function setUp() public {
        // A timestamp far from zero, so that a time before a deadline is still a positive number.
        vm.warp(1_700_000_000);

        usdc = new MockFiatToken(6);
        hostile = new MockHostileToken();

        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(hostile);
        satStake = new SatStake(tokens);

        _fund(address(usdc), staker);
        _fund(address(hostile), staker);
    }

    // ---------------------------------------------------------------------------------------
    // Calling the two functions.
    // ---------------------------------------------------------------------------------------

    function _createActive() internal returns (uint256 id) {
        return _createJudgedBy(referee);
    }

    function _createJudgedBy(address judge) internal returns (uint256 id) {
        vm.prank(staker);
        id = satStake.createPledge(
            address(usdc), 1000, judge, beneficiary, uint64(block.timestamp + DURATION), "Ship the demo"
        );
    }

    /// `markKept` when `kept`, `markBroken` otherwise, so that every rule below is shown to hold
    /// for both functions rather than for whichever one the test happened to pick.
    function _verdict(address caller, uint256 id, bool kept) internal {
        vm.prank(caller);
        if (kept) {
            satStake.markKept(id);
        } else {
            satStake.markBroken(id);
        }
    }

    function _expectOnBoth(address caller, uint256 id, bytes memory expected) internal {
        vm.expectRevert(expected);
        _verdict(caller, id, true);
        vm.expectRevert(expected);
        _verdict(caller, id, false);
    }

    function _status(uint256 id) internal returns (SatStake.Status) {
        return _storedPledge(id).status;
    }

    function _deadlineOf(uint256 id) internal returns (uint64) {
        return _storedPledge(id).deadline;
    }

    function _assertStatus(uint256 id, SatStake.Status expected) internal {
        assertEq(uint8(_status(id)), uint8(expected));
    }

    // ---------------------------------------------------------------------------------------
    // The verdict itself.
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-033
    function test_SC033_markKeptSetsTheStatusToKeptAndEmitsTheVerdict() public {
        uint256 id = _createActive();
        _assertStatus(id, SatStake.Status.Active);

        vm.expectEmit(true, true, true, true, address(satStake));
        emit SatStake.VerdictRecorded(id, true);
        vm.prank(referee);
        satStake.markKept(id);

        _assertStatus(id, SatStake.Status.Kept);
    }

    /// @custom:verifies LLR-SC-033
    function test_SC033_markBrokenSetsTheStatusToBrokenAndEmitsTheVerdict() public {
        uint256 id = _createActive();
        _assertStatus(id, SatStake.Status.Active);

        vm.expectEmit(true, true, true, true, address(satStake));
        emit SatStake.VerdictRecorded(id, false);
        vm.prank(referee);
        satStake.markBroken(id);

        _assertStatus(id, SatStake.Status.Broken);
    }

    /// A verdict sets the status. Everything else the create group wrote, the rest of the record
    /// and the bookkeeping behind it, must read the same afterwards: the stake is still locked, no
    /// identifier was consumed, and no party's index grew. Without this, a verdict that also
    /// released the stake from `totalLocked`, moved the deadline, or pushed the pledge onto the
    /// referee's index again would pass the whole group.
    /// @custom:verifies LLR-SC-033
    function test_SC033_theVerdictChangesTheStatusAndNothingElse() public {
        uint256 id = _createActive();
        uint256 other = _createActive();

        SatStake.Pledge memory before = _storedPledge(id);
        SatStake.Pledge memory otherBefore = _storedPledge(other);
        uint256 lockedBefore = _storedTotalLocked(address(usdc));
        uint256[] memory stakerIdsBefore = _storedPledgeIds(staker);
        uint256[] memory refereeIdsBefore = _storedPledgeIds(referee);
        uint256[] memory beneficiaryIdsBefore = _storedPledgeIds(beneficiary);

        vm.warp(block.timestamp + 1);
        _verdict(referee, id, true);

        SatStake.Pledge memory stored = _storedPledge(id);
        assertEq(uint8(stored.status), uint8(SatStake.Status.Kept));
        assertEq(stored.staker, before.staker);
        assertEq(stored.token, before.token);
        assertEq(stored.amount, before.amount);
        assertEq(stored.referee, before.referee);
        assertEq(stored.beneficiary, before.beneficiary);
        assertEq(stored.deadline, before.deadline);
        assertEq(stored.createdAt, before.createdAt);
        assertEq(stored.promiseText, before.promiseText);

        assertEq(_storedTotalLocked(address(usdc)), lockedBefore);
        assertEq(_storedPledgeIds(staker), stakerIdsBefore);
        assertEq(_storedPledgeIds(referee), refereeIdsBefore);
        assertEq(_storedPledgeIds(beneficiary), beneficiaryIdsBefore);

        // The other pledge is untouched in every field, not only in its status, and the next one
        // takes the next identifier, so the verdict consumed none.
        _assertSameRecord(other, otherBefore);
        assertEq(_createActive(), other + 1);
    }

    /// @custom:verifies LLR-SC-033
    function test_SC033_theVerdictReachesOnlyTheNamedPledge() public {
        uint256 first = _createActive();
        uint256 second = _createActive();
        uint256 third = _createActive();

        _verdict(referee, first, true);
        _verdict(referee, third, false);

        _assertStatus(first, SatStake.Status.Kept);
        _assertStatus(second, SatStake.Status.Active);
        _assertStatus(third, SatStake.Status.Broken);
    }

    /// @custom:verifies LLR-SC-033
    function test_SC033_emitsVerdictRecordedOnceWithTheIdentifierIndexed() public {
        _createActive();
        uint256 id = _createActive();

        for (uint256 i = 0; i < 2; i++) {
            // A kept verdict on the first pass, a broken one on the second, each on its own pledge.
            bool kept = i == 0;
            uint256 subject = kept ? id : _createActive();

            vm.recordLogs();
            _verdict(referee, subject, kept);
            Vm.Log[] memory logs = vm.getRecordedLogs();

            uint256 found;
            for (uint256 j = 0; j < logs.length; j++) {
                if (logs[j].emitter != address(satStake)) continue;
                found++;
                assertEq(logs[j].topics.length, 2);
                assertEq(logs[j].topics[0], SatStake.VerdictRecorded.selector);
                assertEq(uint256(logs[j].topics[1]), subject);
                assertEq(logs[j].data, abi.encode(kept));
            }
            assertEq(found, 1);
        }
    }

    // ---------------------------------------------------------------------------------------
    // Who may record a verdict, and on what (LLR-SC-030, LLR-SC-031).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-030
    function test_SC030_revertsWithPledgeNotFoundForAnIdentifierNeverAssigned() public {
        // Before any pledge exists, every identifier is unknown, including the one the first
        // pledge will take.
        _expectOnBoth(referee, 0, abi.encodeWithSelector(SatStake.PledgeNotFound.selector, 0));
        _expectOnBoth(referee, 1, abi.encodeWithSelector(SatStake.PledgeNotFound.selector, 1));

        uint256 id = _createActive();
        assertEq(id, 1);
        // One past the last assigned identifier, and far beyond it.
        _expectOnBoth(referee, 2, abi.encodeWithSelector(SatStake.PledgeNotFound.selector, 2));
        _expectOnBoth(
            referee, type(uint256).max, abi.encodeWithSelector(SatStake.PledgeNotFound.selector, type(uint256).max)
        );
    }

    /// @custom:verifies LLR-SC-030
    function test_SC030_revertsWithNotRefereeForEveryOtherCaller() public {
        uint256 id = _createActive();

        address[3] memory others = [staker, beneficiary, outsider];
        for (uint256 i = 0; i < others.length; i++) {
            _expectOnBoth(others[i], id, abi.encodeWithSelector(SatStake.NotReferee.selector));
        }

        // The pledge's own referee is accepted.
        _verdict(referee, id, true);
        _assertStatus(id, SatStake.Status.Kept);
    }

    /// @custom:verifies LLR-SC-030
    function test_SC030_theRefereeOfOnePledgeMayNotJudgeAnother() public {
        uint256 mine = _createActive();
        uint256 theirs = _createJudgedBy(outsider);

        _expectOnBoth(outsider, mine, abi.encodeWithSelector(SatStake.NotReferee.selector));
        _expectOnBoth(referee, theirs, abi.encodeWithSelector(SatStake.NotReferee.selector));

        _verdict(outsider, theirs, false);
        _assertStatus(theirs, SatStake.Status.Broken);
        _assertStatus(mine, SatStake.Status.Active);
    }

    /// @custom:verifies LLR-SC-031
    function test_SC031_revertsWithNotActiveForEveryOtherStatus() public {
        // Kept and Broken are reached by recording a verdict. The two settled statuses have no
        // function that produces them yet, so they are written into the record directly.
        SatStake.Status[4] memory statuses = [
            SatStake.Status.Kept,
            SatStake.Status.Broken,
            SatStake.Status.SettledToStaker,
            SatStake.Status.SettledToBeneficiary
        ];

        for (uint256 i = 0; i < statuses.length; i++) {
            uint256 id = _createActive();
            if (statuses[i] == SatStake.Status.Kept) {
                _verdict(referee, id, true);
            } else if (statuses[i] == SatStake.Status.Broken) {
                _verdict(referee, id, false);
            } else {
                _setStoredStatus(id, statuses[i]);
            }
            _assertStatus(id, statuses[i]);

            // The caller is the referee and the deadline is still ahead, so the status is the only
            // thing standing in the way, and the error reports the status the pledge actually has.
            _expectOnBoth(referee, id, abi.encodeWithSelector(SatStake.NotActive.selector, statuses[i]));
        }
    }

    // ---------------------------------------------------------------------------------------
    // The verdict window (LLR-SC-032).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-032
    function test_SC032_acceptsAVerdictOneSecondBeforeTheDeadline() public {
        uint256 kept = _createActive();
        uint256 broken = _createActive();
        uint64 deadline = _deadlineOf(kept);

        vm.warp(deadline - 1);
        _verdict(referee, kept, true);
        _verdict(referee, broken, false);

        _assertStatus(kept, SatStake.Status.Kept);
        _assertStatus(broken, SatStake.Status.Broken);
    }

    /// @custom:verifies LLR-SC-032
    function test_SC032_revertsAtTheDeadline() public {
        uint256 id = _createActive();
        uint64 deadline = _deadlineOf(id);

        vm.warp(deadline);
        _expectOnBoth(referee, id, abi.encodeWithSelector(SatStake.VerdictWindowClosed.selector, deadline));
        _assertStatus(id, SatStake.Status.Active);
    }

    /// @custom:verifies LLR-SC-032
    function test_SC032_revertsAfterTheDeadline() public {
        uint256 id = _createActive();
        uint64 deadline = _deadlineOf(id);
        bytes memory closed = abi.encodeWithSelector(SatStake.VerdictWindowClosed.selector, deadline);

        vm.warp(uint256(deadline) + 1);
        _expectOnBoth(referee, id, closed);

        vm.warp(uint256(deadline) + 365 days);
        _expectOnBoth(referee, id, closed);
    }

    /// @custom:verifies LLR-SC-032
    function test_SC032_theWindowClosesAtTheDeadlineAndNotBeforeIt(uint256 timePick, bool kept) public {
        uint256 id = _createActive();
        uint64 deadline = _deadlineOf(id);
        // A range around the deadline narrow enough that the boundary second itself is reached.
        uint256 when = bound(timePick, uint256(deadline) - 60, uint256(deadline) + 60);

        vm.warp(when);
        if (when >= deadline) {
            vm.expectRevert(abi.encodeWithSelector(SatStake.VerdictWindowClosed.selector, deadline));
        }
        _verdict(referee, id, kept);

        SatStake.Status expected =
            when >= deadline ? SatStake.Status.Active : (kept ? SatStake.Status.Kept : SatStake.Status.Broken);
        _assertStatus(id, expected);
    }

    // ---------------------------------------------------------------------------------------
    // Order of the checks (LLR-SC-030 to LLR-SC-032).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-030 LLR-SC-031 LLR-SC-032
    function test_SC030_checksRunInTheOrderOfTheRequirements() public {
        uint256 judged = _createActive();
        uint256 active = _createActive();
        uint64 deadline = _deadlineOf(active);
        _verdict(referee, judged, true);

        // Past the deadline of both pledges, so every call below fails the window check as well as
        // the checks the requirements put before it.
        vm.warp(uint256(deadline) + 10);

        // Unknown identifier, a caller who is nobody's referee, and a closed window.
        _expectOnBoth(outsider, 99, abi.encodeWithSelector(SatStake.PledgeNotFound.selector, 99));

        // A real pledge, the wrong caller, a status that is not Active, and a closed window.
        _expectOnBoth(outsider, judged, abi.encodeWithSelector(SatStake.NotReferee.selector));

        // The right caller, a status that is not Active, and a closed window.
        _expectOnBoth(referee, judged, abi.encodeWithSelector(SatStake.NotActive.selector, SatStake.Status.Kept));

        // The right caller, an Active pledge, and a closed window: the last check of the four.
        _expectOnBoth(referee, active, abi.encodeWithSelector(SatStake.VerdictWindowClosed.selector, deadline));

        // With the window open again, the same call on the same pledge is recorded.
        vm.warp(uint256(deadline) - 1);
        _verdict(referee, active, true);
        _assertStatus(active, SatStake.Status.Kept);
    }

    // ---------------------------------------------------------------------------------------
    // The reentrancy guard (LLR-SC-003).
    // ---------------------------------------------------------------------------------------

    /// Creates a pledge whose referee is the hostile token, so that a verdict the token records
    /// from inside a transfer would be a valid one but for the guard, then arms the token to make
    /// exactly that call.
    function _armTokenAsReferee(bool kept) internal returns (uint256 id) {
        id = _createJudgedBy(address(hostile));
        assertEq(_storedPledge(id).referee, address(hostile));
        _assertStatus(id, SatStake.Status.Active);
        assertLt(block.timestamp, uint256(_deadlineOf(id)));
        bytes memory verdict =
            kept ? abi.encodeCall(SatStake.markKept, (id)) : abi.encodeCall(SatStake.markBroken, (id));
        hostile.setReentry(address(satStake), verdict);
    }

    /// The staker creates a second pledge in the hostile token; the token calls back from inside
    /// its `transferFrom`, while the contract is still inside `createPledge`.
    function _createInTheHostileToken() internal {
        vm.prank(staker);
        satStake.createPledge(
            address(hostile), 1000, referee, beneficiary, uint64(block.timestamp + DURATION), "Another pledge"
        );
    }

    /// @custom:verifies LLR-SC-003
    function test_SC003_revertsWhenTheTokenReentersMarkKept() public {
        uint256 id = _armTokenAsReferee(true);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _createInTheHostileToken();

        // No verdict was recorded, and the very same call from the very same account goes through
        // once it is not nested inside another SatStake call: the guard, and nothing else, refused
        // it above.
        _assertStatus(id, SatStake.Status.Active);
        _verdict(address(hostile), id, true);
        _assertStatus(id, SatStake.Status.Kept);
    }

    /// @custom:verifies LLR-SC-003
    function test_SC003_revertsWhenTheTokenReentersMarkBroken() public {
        uint256 id = _armTokenAsReferee(false);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _createInTheHostileToken();

        _assertStatus(id, SatStake.Status.Active);
        _verdict(address(hostile), id, false);
        _assertStatus(id, SatStake.Status.Broken);
    }
}
