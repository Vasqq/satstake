// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SatStake} from "../src/SatStake.sol";
import {SatStakeTestBase} from "./base/SatStakeTestBase.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";

/// @notice The read surface: the stored record, the derived state, the counters, the paged index,
/// and the locked total. The group also re-verifies through these views three things earlier groups
/// could only read out of storage: the record a creation stores, the bookkeeping it updates, and the
/// stake a settlement releases.
contract SatStakeViewsTest is SatStakeTestBase {
    // Taken from 05 section 1.1, so the tests bind to the requirement's value rather than to
    // whatever the contract happens to declare.
    uint256 internal constant MAX_PAGE = 100;
    uint64 internal constant DURATION = 1 days;
    uint256 internal constant STAKE = 1000;

    MockFiatToken internal usdc;
    MockFiatToken internal cirbtc;
    MockFiatToken internal unallowed;

    function setUp() public {
        // A timestamp far from zero, so a time before a deadline is still a positive number.
        vm.warp(1_700_000_000);

        usdc = new MockFiatToken(6);
        cirbtc = new MockFiatToken(8);
        unallowed = new MockFiatToken(6);

        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(cirbtc);
        satStake = new SatStake(tokens);

        _fund(address(usdc), staker);
        _fund(address(cirbtc), staker);
        _fund(address(usdc), outsider);
        _fund(address(cirbtc), outsider);
    }

    // ---------------------------------------------------------------------------------------
    // Reaching each state.
    // ---------------------------------------------------------------------------------------

    function _create(address caller, address token, uint256 amount, address ref, address ben, uint64 duration)
        internal
        returns (uint256 id)
    {
        vm.prank(caller);
        id = satStake.createPledge(token, amount, ref, ben, uint64(block.timestamp + duration), "Ship the demo");
    }

    function _activePledge() internal returns (uint256 id) {
        return _create(staker, address(usdc), STAKE, referee, beneficiary, DURATION);
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
    /// run out rather than by writing a status no sequence of calls could produce.
    function _expiredPledge() internal returns (uint256 id) {
        id = _create(staker, address(usdc), STAKE, referee, beneficiary, 60);
        vm.warp(block.timestamp + 60);
    }

    function _settledToStakerPledge() internal returns (uint256 id) {
        id = _keptPledge();
        vm.prank(outsider);
        satStake.settle(id);
    }

    function _settledToBeneficiaryPledge() internal returns (uint256 id) {
        id = _brokenPledge();
        vm.prank(outsider);
        satStake.settle(id);
    }

    // ---------------------------------------------------------------------------------------
    // Oracles written from the requirement text.
    // ---------------------------------------------------------------------------------------

    /// Every field of `getPledge(id)` against the same record read out of storage, so the view is
    /// pinned to what is stored and not only to itself.
    function _assertViewMatchesStorage(uint256 id) internal {
        SatStake.Pledge memory viewed = satStake.getPledge(id);
        SatStake.Pledge memory stored = _storedPledge(id);
        assertEq(viewed.staker, stored.staker);
        assertEq(viewed.token, stored.token);
        assertEq(viewed.amount, stored.amount);
        assertEq(viewed.referee, stored.referee);
        assertEq(viewed.beneficiary, stored.beneficiary);
        assertEq(viewed.deadline, stored.deadline);
        assertEq(viewed.createdAt, stored.createdAt);
        assertEq(uint8(viewed.status), uint8(stored.status));
        assertEq(viewed.promiseText, stored.promiseText);
    }

    /// The sum LLR-SC-055 defines, taken from the pledges themselves rather than from the running
    /// total the contract keeps. A running total compared only against itself proves nothing.
    function _lockedFromPledges(address token) internal view returns (uint256 sum) {
        uint256 count = satStake.pledgeCount();
        for (uint256 id = 1; id <= count; id++) {
            SatStake.Pledge memory p = satStake.getPledge(id);
            if (p.token != token) continue;
            bool counted = p.status == SatStake.Status.Active || p.status == SatStake.Status.Kept
                || p.status == SatStake.Status.Broken;
            if (counted) sum += p.amount;
        }
    }

    function _assertLockedMatchesThePledges(address token) internal view {
        assertEq(satStake.totalLocked(token), _lockedFromPledges(token));
    }

    /// The page LLR-SC-053 describes, computed from the whole index.
    function _expectedPage(uint256[] memory all, uint256 offset, uint256 limit)
        internal
        pure
        returns (uint256[] memory page)
    {
        if (offset >= all.length) return new uint256[](0);
        uint256 size = limit < MAX_PAGE ? limit : MAX_PAGE;
        uint256 remaining = all.length - offset;
        if (size > remaining) size = remaining;
        page = new uint256[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = all[offset + i];
        }
    }

    function _ids(uint256 a) internal pure returns (uint256[] memory out) {
        out = new uint256[](1);
        out[0] = a;
    }

    function _ids(uint256 a, uint256 b) internal pure returns (uint256[] memory out) {
        out = new uint256[](2);
        (out[0], out[1]) = (a, b);
    }

    function _ids(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory out) {
        out = new uint256[](3);
        (out[0], out[1], out[2]) = (a, b, c);
    }

    function _ids(uint256 a, uint256 b, uint256 c, uint256 d) internal pure returns (uint256[] memory out) {
        out = new uint256[](4);
        (out[0], out[1], out[2], out[3]) = (a, b, c, d);
    }

    // ---------------------------------------------------------------------------------------
    // getPledge (LLR-SC-050), which also re-verifies the stored record of LLR-SC-010.
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-010 LLR-SC-050
    function test_SC050_getPledgeReturnsEveryFieldOfTheStoredRecord() public {
        // Distinct values in every field, so a field returned from the wrong slot is visible.
        uint64 deadline = uint64(block.timestamp + 12_345);
        string memory promiseText = unicode"Run 5 km every day for a month é✓";
        vm.prank(staker);
        uint256 id = satStake.createPledge(address(cirbtc), 7777, referee, beneficiary, deadline, promiseText);

        SatStake.Pledge memory p = satStake.getPledge(id);
        assertEq(p.staker, staker);
        assertEq(p.token, address(cirbtc));
        assertEq(p.amount, 7777);
        assertEq(p.referee, referee);
        assertEq(p.beneficiary, beneficiary);
        assertEq(p.deadline, deadline);
        assertEq(p.createdAt, uint64(block.timestamp));
        assertEq(uint8(p.status), uint8(SatStake.Status.Active));
        assertEq(p.promiseText, promiseText);
        _assertViewMatchesStorage(id);
    }

    /// @custom:verifies LLR-SC-010 LLR-SC-050
    function test_SC050_getPledgeKeepsEachPledgeApart() public {
        uint64 firstDeadline = uint64(block.timestamp + 600);
        vm.prank(staker);
        uint256 first = satStake.createPledge(address(usdc), 11, referee, beneficiary, firstDeadline, "first");

        vm.warp(block.timestamp + 100);
        uint64 secondDeadline = uint64(block.timestamp + 900);
        vm.prank(outsider);
        uint256 second = satStake.createPledge(address(cirbtc), 22, beneficiary, referee, secondDeadline, "second");

        SatStake.Pledge memory a = satStake.getPledge(first);
        SatStake.Pledge memory b = satStake.getPledge(second);
        assertEq(a.staker, staker);
        assertEq(a.token, address(usdc));
        assertEq(a.amount, 11);
        assertEq(a.referee, referee);
        assertEq(a.beneficiary, beneficiary);
        assertEq(a.deadline, firstDeadline);
        assertEq(a.promiseText, "first");
        assertEq(b.staker, outsider);
        assertEq(b.token, address(cirbtc));
        assertEq(b.amount, 22);
        assertEq(b.referee, beneficiary);
        assertEq(b.beneficiary, referee);
        assertEq(b.deadline, secondDeadline);
        assertEq(b.promiseText, "second");
        assertEq(a.createdAt + 100, b.createdAt);
    }

    /// @custom:verifies LLR-SC-010 LLR-SC-050
    function test_SC050_getPledgeReturnsAPromiseOfEveryStoredLength() public {
        // A one-slot promise, the longest that still fits in one slot, and a multi-byte one: the
        // stored form differs between the short and the long case.
        string[3] memory promises;
        promises[0] = "x";
        promises[1] = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        promises[2] = unicode"日本語 promise with a tail that runs past one slot";
        for (uint256 i = 0; i < promises.length; i++) {
            vm.prank(staker);
            uint256 id = satStake.createPledge(
                address(usdc), 1, referee, beneficiary, uint64(block.timestamp + DURATION), promises[i]
            );
            assertEq(satStake.getPledge(id).promiseText, promises[i]);
        }
    }

    /// @custom:verifies LLR-SC-050
    function test_SC050_getPledgeRevertsForIdentifierZero() public {
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, 0));
        satStake.getPledge(0);

        // Zero stays unknown once pledges exist: it is never assigned.
        _activePledge();
        _activePledge();
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, 0));
        satStake.getPledge(0);
    }

    /// @custom:verifies LLR-SC-050 LLR-SC-052
    function test_SC050_getPledgeRevertsAboveThePledgeCountAndNotAtIt() public {
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, 1));
        satStake.getPledge(1);

        uint256 id = _activePledge();
        assertEq(satStake.pledgeCount(), id);
        // The last identifier assigned is found; the next one is not.
        assertEq(satStake.getPledge(id).staker, staker);
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, id + 1));
        satStake.getPledge(id + 1);

        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, type(uint256).max));
        satStake.getPledge(type(uint256).max);
    }

    /// @custom:verifies LLR-SC-050
    function test_SC050_getPledgeFollowsTheStoredStatusThroughTheLifecycle() public {
        uint256 id = _activePledge();
        assertEq(uint8(satStake.getPledge(id).status), uint8(SatStake.Status.Active));

        vm.prank(referee);
        satStake.markKept(id);
        assertEq(uint8(satStake.getPledge(id).status), uint8(SatStake.Status.Kept));

        vm.prank(outsider);
        satStake.settle(id);
        assertEq(uint8(satStake.getPledge(id).status), uint8(SatStake.Status.SettledToStaker));
        _assertViewMatchesStorage(id);
    }

    // ---------------------------------------------------------------------------------------
    // stateOf (LLR-SC-051).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-051
    function test_SC051_reportsActiveOneSecondBeforeTheDeadline() public {
        uint256 id = _activePledge();
        vm.warp(satStake.getPledge(id).deadline - 1);
        assertEq(uint8(satStake.stateOf(id)), uint8(SatStake.PledgeState.Active));
    }

    /// @custom:verifies LLR-SC-051
    function test_SC051_reportsExpiredAtTheDeadlineAndAfterIt() public {
        uint256 id = _activePledge();
        uint64 deadline = satStake.getPledge(id).deadline;

        vm.warp(deadline);
        assertEq(uint8(satStake.stateOf(id)), uint8(SatStake.PledgeState.Expired));

        vm.warp(uint256(deadline) + 30 days);
        assertEq(uint8(satStake.stateOf(id)), uint8(SatStake.PledgeState.Expired));
    }

    /// `Expired` is not a stored status: the record keeps saying `Active` while the derived view
    /// says `Expired`, which is the whole of the difference between the two views.
    /// @custom:verifies LLR-SC-011 LLR-SC-050 LLR-SC-051
    function test_SC051_expiredIsDerivedAndNeverStored() public {
        uint256 id = _expiredPledge();
        assertEq(uint8(satStake.stateOf(id)), uint8(SatStake.PledgeState.Expired));
        assertEq(uint8(satStake.getPledge(id).status), uint8(SatStake.Status.Active));
        assertEq(uint8(_storedPledge(id).status), uint8(SatStake.Status.Active));
    }

    /// @custom:verifies LLR-SC-051
    function test_SC051_reportsTheStateMatchingEveryOtherStoredStatus() public {
        uint256 kept = _keptPledge();
        uint256 broken = _brokenPledge();
        uint256 toStaker = _settledToStakerPledge();
        uint256 toBeneficiary = _settledToBeneficiaryPledge();

        assertEq(uint8(satStake.stateOf(kept)), uint8(SatStake.PledgeState.Kept));
        assertEq(uint8(satStake.stateOf(broken)), uint8(SatStake.PledgeState.Broken));
        assertEq(uint8(satStake.stateOf(toStaker)), uint8(SatStake.PledgeState.SettledToStaker));
        assertEq(uint8(satStake.stateOf(toBeneficiary)), uint8(SatStake.PledgeState.SettledToBeneficiary));
    }

    /// Only a stored `Active` pledge expires. A judged or settled one keeps its state once its
    /// deadline has passed.
    /// @custom:verifies LLR-SC-051
    function test_SC051_aPassedDeadlineChangesNoOtherState() public {
        uint256 kept = _keptPledge();
        uint256 broken = _brokenPledge();
        uint256 toStaker = _settledToStakerPledge();
        uint256 toBeneficiary = _settledToBeneficiaryPledge();

        vm.warp(block.timestamp + 365 days);

        assertEq(uint8(satStake.stateOf(kept)), uint8(SatStake.PledgeState.Kept));
        assertEq(uint8(satStake.stateOf(broken)), uint8(SatStake.PledgeState.Broken));
        assertEq(uint8(satStake.stateOf(toStaker)), uint8(SatStake.PledgeState.SettledToStaker));
        assertEq(uint8(satStake.stateOf(toBeneficiary)), uint8(SatStake.PledgeState.SettledToBeneficiary));
    }

    /// @custom:verifies LLR-SC-050 LLR-SC-051
    function test_SC051_revertsOnTheSameIdentifiersAsGetPledge() public {
        uint256[3] memory unknown;
        unknown[0] = 0;
        unknown[1] = 1;
        unknown[2] = type(uint256).max;
        for (uint256 i = 0; i < unknown.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, unknown[i]));
            satStake.stateOf(unknown[i]);
            vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, unknown[i]));
            satStake.getPledge(unknown[i]);
        }

        uint256 id = _activePledge();
        // With a pledge present, zero and the identifier past the end are still unknown to both.
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, 0));
        satStake.stateOf(0);
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, id + 1));
        satStake.stateOf(id + 1);
    }

    /// @custom:verifies LLR-SC-051
    function test_SC051_turnsExpiredExactlyAtTheDeadline(uint256 timePick) public {
        uint256 id = _activePledge();
        uint64 deadline = satStake.getPledge(id).deadline;
        uint256 at = bound(timePick, uint256(deadline) - 120, uint256(deadline) + 120);

        vm.warp(at);
        SatStake.PledgeState expected = at >= deadline ? SatStake.PledgeState.Expired : SatStake.PledgeState.Active;
        assertEq(uint8(satStake.stateOf(id)), uint8(expected));
    }

    // ---------------------------------------------------------------------------------------
    // pledgeCount (LLR-SC-052).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-052
    function test_SC052_countsEveryPledgeEverCreated() public {
        assertEq(satStake.pledgeCount(), 0);
        assertEq(_activePledge(), 1);
        assertEq(satStake.pledgeCount(), 1);
        _create(outsider, address(cirbtc), 5, referee, beneficiary, DURATION);
        assertEq(satStake.pledgeCount(), 2);
        _activePledge();
        assertEq(satStake.pledgeCount(), 3);
    }

    /// "Ever created": a verdict or a settlement does not take a pledge out of the count.
    /// @custom:verifies LLR-SC-052
    function test_SC052_isNotReducedByVerdictsOrSettlements() public {
        _settledToStakerPledge();
        _settledToBeneficiaryPledge();
        _keptPledge();
        _expiredPledge();
        assertEq(satStake.pledgeCount(), 4);
    }

    // ---------------------------------------------------------------------------------------
    // pledgeCountOf and pledgeIdsOf (LLR-SC-053).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-053
    function test_SC053_pledgeCountOfCountsTheAccountsOwnIndex() public {
        assertEq(satStake.pledgeCountOf(staker), 0);

        uint256 first = _activePledge();
        uint256 second = _create(staker, address(usdc), 1, beneficiary, referee, DURATION);
        uint256 third = _create(outsider, address(usdc), 1, referee, beneficiary, DURATION);

        assertEq(satStake.pledgeCountOf(staker), 2);
        assertEq(satStake.pledgeCountOf(outsider), 1);
        assertEq(satStake.pledgeCountOf(referee), 3);
        assertEq(satStake.pledgeCountOf(beneficiary), 3);
        assertEq(satStake.pledgeCountOf(address(satStake)), 0);
        assertEq(satStake.pledgeIdsOf(staker, 0, MAX_PAGE), _ids(first, second));
        assertEq(satStake.pledgeIdsOf(outsider, 0, MAX_PAGE), _ids(third));
        assertEq(satStake.pledgeIdsOf(referee, 0, MAX_PAGE), _ids(first, second, third));
    }

    /// @custom:verifies LLR-SC-053
    function test_SC053_pledgeIdsOfReturnsCreationOrder() public {
        uint256 first = _activePledge();
        uint256 second = _create(outsider, address(usdc), 1, referee, beneficiary, DURATION);
        uint256 third = _activePledge();

        assertEq(satStake.pledgeIdsOf(referee, 0, MAX_PAGE), _ids(first, second, third));
        // A verdict and a settlement leave the index alone.
        vm.prank(referee);
        satStake.markKept(third);
        vm.prank(outsider);
        satStake.settle(third);
        assertEq(satStake.pledgeIdsOf(referee, 0, MAX_PAGE), _ids(first, second, third));
    }

    /// @custom:verifies LLR-SC-053
    function test_SC053_pledgeIdsOfPagesThroughTheIndex() public {
        uint256 a = _activePledge();
        uint256 b = _activePledge();
        uint256 c = _activePledge();
        uint256 d = _activePledge();

        assertEq(satStake.pledgeIdsOf(staker, 0, 2), _ids(a, b));
        assertEq(satStake.pledgeIdsOf(staker, 2, 2), _ids(c, d));
        assertEq(satStake.pledgeIdsOf(staker, 1, 1), _ids(b));
        assertEq(satStake.pledgeIdsOf(staker, 3, 1), _ids(d));
        assertEq(satStake.pledgeIdsOf(staker, 0, 4), _ids(a, b, c, d));
    }

    /// Boundary named by 06 section 4: `offset` equal to the account's count.
    /// @custom:verifies LLR-SC-053
    function test_SC053_pledgeIdsOfWithOffsetEqualToTheCountReturnsAnEmptyPage() public {
        _activePledge();
        _activePledge();
        assertEq(satStake.pledgeCountOf(staker), 2);
        assertEq(satStake.pledgeIdsOf(staker, 2, MAX_PAGE).length, 0);
    }

    /// @custom:verifies LLR-SC-053
    function test_SC053_pledgeIdsOfWithOffsetPastTheEndReturnsAnEmptyPage() public {
        _activePledge();
        uint256 last = _activePledge();
        assertEq(satStake.pledgeIdsOf(staker, 3, MAX_PAGE).length, 0);
        assertEq(satStake.pledgeIdsOf(staker, 1000, MAX_PAGE).length, 0);
        assertEq(satStake.pledgeIdsOf(staker, type(uint256).max, MAX_PAGE).length, 0);
        // The last offset inside the index still returns its entry, so the empty pages above are
        // the offset running out and not the view returning nothing.
        assertEq(satStake.pledgeIdsOf(staker, 1, MAX_PAGE), _ids(last));
    }

    /// Boundary named by 06 section 4: `limit` of 0.
    /// @custom:verifies LLR-SC-053
    function test_SC053_pledgeIdsOfWithLimitZeroReturnsAnEmptyPage() public {
        uint256 first = _activePledge();
        uint256 second = _activePledge();
        assertEq(satStake.pledgeIdsOf(staker, 0, 0).length, 0);
        assertEq(satStake.pledgeIdsOf(staker, 1, 0).length, 0);
        // One more than the boundary returns one identifier, so a limit of zero is the limit and
        // not the view returning nothing.
        assertEq(satStake.pledgeIdsOf(staker, 0, 1), _ids(first));
        assertEq(satStake.pledgeIdsOf(staker, 1, 1), _ids(second));
    }

    /// @custom:verifies LLR-SC-053
    function test_SC053_pledgeIdsOfForAnAccountWithNoPledgesReturnsAnEmptyPage() public {
        uint256 id = _activePledge();
        address nobody = makeAddr("nobody");
        assertEq(satStake.pledgeCountOf(nobody), 0);
        assertEq(satStake.pledgeIdsOf(nobody, 0, MAX_PAGE).length, 0);
        assertEq(satStake.pledgeIdsOf(nobody, 0, 0).length, 0);
        assertEq(satStake.pledgeIdsOf(nobody, 5, MAX_PAGE).length, 0);
        // A party to the same pledge does have a page, so the empty ones belong to the account.
        assertEq(satStake.pledgeIdsOf(staker, 0, MAX_PAGE), _ids(id));
    }

    /// A page that runs off the end returns what is left, rather than reverting or padding.
    /// @custom:verifies LLR-SC-053
    function test_SC053_pledgeIdsOfReturnsTheRemainderWhenThePageRunsOffTheEnd() public {
        uint256 a = _activePledge();
        uint256 b = _activePledge();
        uint256 c = _activePledge();

        assertEq(satStake.pledgeIdsOf(staker, 1, 10), _ids(b, c));
        assertEq(satStake.pledgeIdsOf(staker, 2, MAX_PAGE), _ids(c));
        assertEq(satStake.pledgeIdsOf(staker, 0, type(uint256).max), _ids(a, b, c));
    }

    /// Boundary named by 06 section 4: `limit` above `MAX_PAGE`, which needs an index longer than
    /// one page before the cap is observable.
    /// @custom:verifies LLR-SC-053
    function test_SC053_pledgeIdsOfWithLimitAboveMaxPageReturnsAtMostMaxPage() public {
        uint256 total = MAX_PAGE + 1;
        for (uint256 i = 0; i < total; i++) {
            _create(staker, address(usdc), 1, referee, beneficiary, DURATION);
        }
        assertEq(satStake.pledgeCountOf(staker), total);

        uint256[] memory whole = satStake.pledgeIdsOf(staker, 0, MAX_PAGE + 1);
        assertEq(whole.length, MAX_PAGE);
        assertEq(whole[0], 1);
        assertEq(whole[MAX_PAGE - 1], MAX_PAGE);
        assertEq(satStake.pledgeIdsOf(staker, 0, type(uint256).max).length, MAX_PAGE);

        // The last identifier is only reachable on a second page.
        uint256[] memory rest = satStake.pledgeIdsOf(staker, MAX_PAGE, MAX_PAGE + 1);
        assertEq(rest, _ids(total));
    }

    /// Every run builds an index of its own, so the run count is kept to a quarter of the default:
    /// the bounded input space is about a thousand pairs and the named boundary tests above carry
    /// the bounds themselves.
    /// forge-config: default.fuzz.runs = 256
    /// @custom:verifies LLR-SC-053
    function test_SC053_pledgeIdsOfMatchesTheIndexForAnyOffsetAndLimit(uint256 offset, uint256 limit) public {
        for (uint256 i = 0; i < 5; i++) {
            _create(staker, address(usdc), 1, referee, beneficiary, DURATION);
        }
        uint256[] memory all = _storedPledgeIds(staker);
        assertEq(all.length, 5);

        uint256 boundedOffset = bound(offset, 0, 8);
        uint256 boundedLimit = bound(limit, 0, MAX_PAGE + 8);

        assertEq(
            satStake.pledgeIdsOf(staker, boundedOffset, boundedLimit), _expectedPage(all, boundedOffset, boundedLimit)
        );
    }

    // ---------------------------------------------------------------------------------------
    // totalLocked (LLR-SC-055).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-055
    function test_SC055_sumsTheTokensActiveKeptAndBrokenPledges() public {
        uint256 active = _create(staker, address(usdc), 100, referee, beneficiary, DURATION);
        uint256 kept = _create(staker, address(usdc), 200, referee, beneficiary, DURATION);
        uint256 broken = _create(staker, address(usdc), 400, referee, beneficiary, DURATION);
        uint256 settled = _create(staker, address(usdc), 800, referee, beneficiary, DURATION);
        assertEq(satStake.totalLocked(address(usdc)), 1500);

        vm.prank(referee);
        satStake.markKept(kept);
        vm.prank(referee);
        satStake.markBroken(broken);
        vm.prank(referee);
        satStake.markKept(settled);
        // A verdict leaves the stake locked: only a settlement releases it.
        assertEq(satStake.totalLocked(address(usdc)), 1500);
        _assertLockedMatchesThePledges(address(usdc));

        vm.prank(outsider);
        satStake.settle(settled);
        assertEq(satStake.totalLocked(address(usdc)), 700);
        _assertLockedMatchesThePledges(address(usdc));

        // The three that remain are the Active, Kept, and Broken ones the requirement names.
        assertEq(uint8(satStake.getPledge(active).status), uint8(SatStake.Status.Active));
        assertEq(uint8(satStake.getPledge(kept).status), uint8(SatStake.Status.Kept));
        assertEq(uint8(satStake.getPledge(broken).status), uint8(SatStake.Status.Broken));
    }

    /// An expired pledge is stored `Active`, so its stake stays locked until it is settled.
    /// @custom:verifies LLR-SC-055
    function test_SC055_countsAnExpiredPledgeUntilItIsSettled() public {
        uint256 id = _expiredPledge();
        assertEq(uint8(satStake.stateOf(id)), uint8(SatStake.PledgeState.Expired));
        assertEq(satStake.totalLocked(address(usdc)), STAKE);
        _assertLockedMatchesThePledges(address(usdc));

        vm.prank(outsider);
        satStake.settle(id);
        assertEq(satStake.totalLocked(address(usdc)), 0);
        _assertLockedMatchesThePledges(address(usdc));
    }

    /// The whole definition, over a sequence of creations, verdicts, and settlements in two tokens,
    /// against a sum taken from the pledges rather than from the running total.
    /// @custom:verifies LLR-SC-055
    function test_SC055_matchesTheSumOverThePledgesAtEveryStep() public {
        uint256 one = _create(staker, address(usdc), 100, referee, beneficiary, DURATION);
        _assertLockedMatchesThePledges(address(usdc));
        _assertLockedMatchesThePledges(address(cirbtc));

        uint256 two = _create(outsider, address(cirbtc), 7, referee, beneficiary, DURATION);
        uint256 three = _create(staker, address(cirbtc), 9, beneficiary, referee, DURATION);
        _assertLockedMatchesThePledges(address(usdc));
        _assertLockedMatchesThePledges(address(cirbtc));

        vm.prank(referee);
        satStake.markKept(one);
        vm.prank(referee);
        satStake.markBroken(two);
        _assertLockedMatchesThePledges(address(usdc));
        _assertLockedMatchesThePledges(address(cirbtc));

        vm.prank(outsider);
        satStake.settle(one);
        _assertLockedMatchesThePledges(address(usdc));
        _assertLockedMatchesThePledges(address(cirbtc));

        vm.prank(outsider);
        satStake.settle(two);
        _assertLockedMatchesThePledges(address(usdc));
        _assertLockedMatchesThePledges(address(cirbtc));

        // Reaching the deadline settles nothing by itself, so the totals must already agree here.
        vm.warp(satStake.getPledge(three).deadline);
        _assertLockedMatchesThePledges(address(usdc));
        _assertLockedMatchesThePledges(address(cirbtc));

        vm.prank(outsider);
        satStake.settle(three);
        assertEq(satStake.totalLocked(address(usdc)), 0);
        assertEq(satStake.totalLocked(address(cirbtc)), 0);
        _assertLockedMatchesThePledges(address(usdc));
        _assertLockedMatchesThePledges(address(cirbtc));
    }

    /// The walk above reaches every pledge, but only of the one shape the other tests create. A
    /// stake wider than 64 bits and a promise past the one-slot boundary are both inside what
    /// LLR-SC-022 and LLR-SC-026 permit, and a running total that narrowed or padded either would
    /// otherwise never return to zero unnoticed.
    /// @custom:verifies LLR-SC-055
    function test_SC055_matchesTheSumForStakesAndPromisesOfAnySize() public {
        uint256 wide = uint256(type(uint64).max) + 12_345;
        vm.prank(staker);
        uint256 big = satStake.createPledge(
            address(usdc), wide, referee, beneficiary, uint64(block.timestamp + DURATION), "Ship the demo"
        );
        _assertLockedMatchesThePledges(address(usdc));
        assertEq(satStake.totalLocked(address(usdc)), wide);

        // 40 bytes, so the promise spills out of the single slot a short string occupies.
        vm.prank(staker);
        uint256 wordy = satStake.createPledge(
            address(usdc),
            100,
            referee,
            beneficiary,
            uint64(block.timestamp + DURATION),
            "Ship the demo before the month is out."
        );
        assertGt(bytes(satStake.getPledge(wordy).promiseText).length, 31);
        _assertLockedMatchesThePledges(address(usdc));
        assertEq(satStake.totalLocked(address(usdc)), wide + 100);

        // Both run to their deadline and settle, so the walk sees each shape in every status it
        // counts and in the one it does not.
        vm.warp(satStake.getPledge(big).deadline);
        vm.prank(outsider);
        satStake.settle(big);
        _assertLockedMatchesThePledges(address(usdc));
        vm.prank(outsider);
        satStake.settle(wordy);
        _assertLockedMatchesThePledges(address(usdc));
        assertEq(satStake.totalLocked(address(usdc)), 0);
    }

    /// @custom:verifies LLR-SC-055
    function test_SC055_keepsTokensApart() public {
        _create(staker, address(usdc), 100, referee, beneficiary, DURATION);
        _create(staker, address(cirbtc), 7, referee, beneficiary, DURATION);
        assertEq(satStake.totalLocked(address(usdc)), 100);
        assertEq(satStake.totalLocked(address(cirbtc)), 7);
        assertEq(satStake.totalLocked(address(unallowed)), 0);
    }

    /// Nothing but a token ever accumulates a locked total. Without this, a stray write keyed by a
    /// party's address goes unnoticed, since no other view reads that mapping.
    /// @custom:verifies LLR-SC-055
    function test_SC055_isZeroForAnAddressThatIsNotAToken() public {
        address[5] memory notTokens = [staker, referee, beneficiary, outsider, address(satStake)];

        uint256 kept = _keptPledge();
        uint256 broken = _brokenPledge();
        _activePledge();
        vm.prank(outsider);
        satStake.settle(kept);
        vm.prank(outsider);
        satStake.settle(broken);

        // The token itself holds the locked stake, so a zero at every other key is the key and not
        // an empty mapping.
        assertEq(satStake.totalLocked(address(usdc)), STAKE);
        for (uint256 i = 0; i < notTokens.length; i++) {
            assertEq(satStake.totalLocked(notTokens[i]), 0);
            _assertLockedMatchesThePledges(notTokens[i]);
        }
        assertEq(satStake.totalLocked(address(0)), 0);
        assertEq(satStake.totalLocked(address(unallowed)), 0);
    }

    // ---------------------------------------------------------------------------------------
    // The bookkeeping earlier groups could only read out of storage.
    // ---------------------------------------------------------------------------------------

    /// Re-verifies through the views what the create group had to read with `vm.load`.
    /// @custom:verifies LLR-SC-028 LLR-SC-053 LLR-SC-055
    function test_SC028_creationRaisesTheLockedTotalAndIndexesEveryParty() public {
        assertEq(satStake.totalLocked(address(usdc)), 0);
        assertEq(satStake.pledgeCountOf(staker), 0);

        uint256 first = _create(staker, address(usdc), 1000, referee, beneficiary, DURATION);
        assertEq(satStake.totalLocked(address(usdc)), 1000);
        assertEq(satStake.totalLocked(address(cirbtc)), 0);
        assertEq(satStake.pledgeIdsOf(staker, 0, MAX_PAGE), _ids(first));
        assertEq(satStake.pledgeIdsOf(referee, 0, MAX_PAGE), _ids(first));
        assertEq(satStake.pledgeIdsOf(beneficiary, 0, MAX_PAGE), _ids(first));
        assertEq(satStake.pledgeCountOf(outsider), 0);

        uint256 second = _create(staker, address(usdc), 250, referee, beneficiary, DURATION);
        uint256 third = _create(staker, address(cirbtc), 7, referee, beneficiary, DURATION);
        assertEq(satStake.totalLocked(address(usdc)), 1250);
        assertEq(satStake.totalLocked(address(cirbtc)), 7);
        assertEq(satStake.pledgeIdsOf(staker, 0, MAX_PAGE), _ids(first, second, third));
        assertEq(satStake.pledgeIdsOf(referee, 0, MAX_PAGE), _ids(first, second, third));
        assertEq(satStake.pledgeIdsOf(beneficiary, 0, MAX_PAGE), _ids(first, second, third));
    }

    /// Re-verifies through `totalLocked` the release of the stake that the settle group could only
    /// read with `vm.load`.
    /// @custom:verifies LLR-SC-043 LLR-SC-055
    function test_SC043_settlementReleasesExactlyTheStakeFromTheLockedTotal() public {
        uint256 kept = _create(staker, address(usdc), 300, referee, beneficiary, DURATION);
        uint256 other = _create(staker, address(usdc), 500, referee, beneficiary, DURATION);
        uint256 elsewhere = _create(staker, address(cirbtc), 11, referee, beneficiary, DURATION);
        vm.prank(referee);
        satStake.markKept(kept);

        uint256 lockedBefore = satStake.totalLocked(address(usdc));
        vm.prank(outsider);
        satStake.settle(kept);

        assertEq(satStake.totalLocked(address(usdc)), lockedBefore - 300);
        // The other pledges keep their stake locked.
        assertEq(satStake.totalLocked(address(cirbtc)), 11);
        assertEq(uint8(satStake.getPledge(other).status), uint8(SatStake.Status.Active));
        assertEq(uint8(satStake.getPledge(elsewhere).status), uint8(SatStake.Status.Active));
        _assertLockedMatchesThePledges(address(usdc));
        _assertLockedMatchesThePledges(address(cirbtc));
    }

    // ---------------------------------------------------------------------------------------
    // The views are reads.
    // ---------------------------------------------------------------------------------------

    /// Every view is called against live state and the contract's storage writes are recorded.
    /// A view that wrote would show up here even though no other test would notice. Every branch
    /// is walked, not just one path through each function: a write placed in a branch the
    /// recording never enters is invisible, which is how this test first passed against a view
    /// that wrote inside the Expired arm of `stateOf`.
    /// @custom:verifies LLR-SC-050 LLR-SC-051 LLR-SC-052 LLR-SC-053 LLR-SC-055
    function test_SC050_theViewsWriteNoStorage() public {
        uint256 kept = _keptPledge();
        uint256 broken = _brokenPledge();
        uint256 settledToStaker = _settledToStakerPledge();
        uint256 settledToBeneficiary = _settledToBeneficiaryPledge();
        uint256 active = _activePledge();
        uint256 expired = _expiredPledge();
        // An account no pledge names, so the empty-index paths are walked too.
        address noParty = makeAddr("noParty");

        vm.record();

        // Every status `stateOf` can report, including both arms of the Active branch.
        satStake.stateOf(active);
        satStake.stateOf(expired);
        satStake.stateOf(kept);
        satStake.stateOf(broken);
        satStake.stateOf(settledToStaker);
        satStake.stateOf(settledToBeneficiary);

        satStake.getPledge(kept);
        satStake.getPledge(satStake.pledgeCount());
        satStake.pledgeCount();
        satStake.pledgeCountOf(staker);
        satStake.pledgeCountOf(noParty);

        // Both of `pledgeIdsOf`'s returns: a page it builds, and the empty one it takes early.
        uint256 count = satStake.pledgeCountOf(staker);
        satStake.pledgeIdsOf(staker, 0, MAX_PAGE);
        satStake.pledgeIdsOf(staker, 0, MAX_PAGE + 1);
        satStake.pledgeIdsOf(staker, 1, 1);
        satStake.pledgeIdsOf(staker, count - 1, 5);
        satStake.pledgeIdsOf(staker, count, 1);
        satStake.pledgeIdsOf(noParty, 0, 1);

        satStake.totalLocked(address(usdc));
        satStake.totalLocked(address(unallowed));
        satStake.isAllowedToken(address(usdc));
        satStake.allowedTokens();

        (, bytes32[] memory writes) = vm.accesses(address(satStake));
        assertEq(writes.length, 0);

        // The reverting paths are reads too, and they are the two branches the calls above skip.
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, uint256(0)));
        satStake.getPledge(0);
        vm.expectRevert(abi.encodeWithSelector(SatStake.PledgeNotFound.selector, count + 999));
        satStake.stateOf(count + 999);
        (, bytes32[] memory afterReverts) = vm.accesses(address(satStake));
        assertEq(afterReverts.length, 0);
    }
}
