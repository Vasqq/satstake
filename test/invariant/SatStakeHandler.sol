// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {SatStake} from "../../src/SatStake.sol";
import {MockFiatToken} from "../mocks/MockFiatToken.sol";

/// @notice Drives SatStake through arbitrary sequences of create, verdict, settle, time jumps, and
/// token blocklist and pause changes, and keeps the bookkeeping the invariants read.
///
/// Three things shape the design. The fuzzer picks one of this contract's actions at random for each
/// call in a sequence, so the action space is exactly the set of selectors the test registers. Only
/// four accounts take part, so a sequence returns to the same pledges often enough to reach the later
/// states rather than only creating new ones. Inputs are bounded rather than assumed away, because a
/// rejected input would waste the call: `bound` maps every value the fuzzer offers onto a usable one.
///
/// The handler owns the two mock tokens, so it is their issuer and can blocklist and pause them. It
/// never blocklists SatStake itself, which would stop every transfer in the sequence instead of the
/// one transfer the isolation requirement is about.
///
/// It records rather than asserts. `fail_on_revert` is false for these campaigns, so a revert raised
/// inside a handler call, which is what a failed assertion here would be, is tolerated and the
/// sequence continues. Anything that must fail the test is therefore counted and left for the
/// invariant functions to assert.
contract SatStakeHandler is Test {
    /// One observed change of a pledge's stored status, with what the diagram's edge labels need to
    /// judge it: who made the call, and whether the pledge's deadline had been reached.
    struct Transition {
        uint256 id;
        uint8 from;
        uint8 to;
        address caller;
        bool deadlineReached;
    }

    /// A settle call that reverted on a pledge that was settleable, with the state either side of it.
    struct FailedSettle {
        uint256 id;
        uint8 statusBefore;
        uint8 statusAfter;
        uint256 lockedBefore;
        uint256 lockedAfter;
        uint256 balanceBefore;
        uint256 balanceAfter;
    }

    // Which pledges an action wants to act on. The fuzzer would almost never guess an identifier in
    // the right state, so each action asks for a state and takes a matching pledge if one exists.
    enum Wanted {
        Any,
        ActiveBeforeDeadline,
        Kept,
        Broken,
        ExpiredActive,
        Settleable
    }

    uint256 internal constant MAX_STAKE = 1e12;
    // Long enough that a pledge created late in a sequence can still be judged before its deadline,
    // short enough that the time jumps in one sequence carry pledges past their deadlines, so the
    // expired row of the recipient table is reached and not only the two judged ones.
    uint64 internal constant MAX_PLEDGE_DURATION = 12 hours;
    uint256 internal constant MAX_WARP = 3 hours;
    // One pledge in three is left for its deadline to settle. The two verdict actions are called
    // about twice as often as the creation action, so without a reservation every pledge would be
    // judged while it was still Active and no pledge would ever expire. The arbitrary branch of the
    // verdict actions can still name a reserved pledge, so no call is made impossible.
    uint256 internal constant RESERVED_FOR_EXPIRY = 3;

    SatStake public satStake;
    MockFiatToken public usdc;
    MockFiatToken public cirbtc;
    address[4] public actors;

    // Ghost state. `createdAs` is the record as it stood at creation, which is what a later reading of
    // the same pledge is compared against. `ghostLocked` is a running total kept independently of the
    // contract's own.
    mapping(uint256 => SatStake.Pledge) private _createdAs;
    mapping(address => uint256) public ghostLocked;
    mapping(uint256 => SatStake.Status) private _lastStatus;
    Transition[] private _transitions;
    FailedSettle[] private _failedSettles;

    // `PledgeSettled` events, captured per pledge.
    mapping(uint256 => uint256) public settledEvents;
    mapping(uint256 => address) public settledRecipient;
    mapping(uint256 => uint256) public settledAmount;
    uint256 public settledEventTotal;
    uint256 public highestSettledId;

    // Counters that show the sequences were not vacuous. A handler whose every call reverted would
    // satisfy every invariant while proving nothing.
    uint256 public actionCount;
    uint256 public createCount;
    uint256 public keptCount;
    uint256 public brokenCount;
    uint256 public settleToStakerCount;
    uint256 public settleBrokenCount;
    uint256 public settleExpiredCount;
    uint256 public blockedTransferCount;
    uint256 public warpCount;
    uint256 public issuerControlCount;
    uint256 public successWhileSomeoneBlockedCount;
    uint256 public rejectedCount;

    // Failures the invariants must see. An identifier seen as new twice means a record was written
    // over; a probe step refused means one pledge's refused payout stopped another pledge working.
    uint256 public reusedIdentifierCount;
    uint256 public probeCount;
    uint256 public probeFailureCount;

    constructor() {
        // Deployed here so that this contract is their issuer and can work their controls.
        usdc = new MockFiatToken(6);
        cirbtc = new MockFiatToken(8);
        actors = [makeAddr("alice"), makeAddr("bob"), makeAddr("carol"), makeAddr("dave")];
    }

    /// @notice Records the contract under test and puts every actor in front of it, funded and
    /// approved. Called once, before any token control is touched, because the mock refuses an
    /// approval from a blocklisted account.
    function initialize(SatStake satStake_) external {
        satStake = satStake_;
        for (uint256 i = 0; i < actors.length; i++) {
            usdc.mint(actors[i], 1e30);
            cirbtc.mint(actors[i], 1e30);
            vm.prank(actors[i]);
            usdc.approve(address(satStake), 1e30);
            vm.prank(actors[i]);
            cirbtc.approve(address(satStake), 1e30);
        }
    }

    // ---------------------------------------------------------------------------------------
    // Actions.
    // ---------------------------------------------------------------------------------------

    function createPledge(
        uint256 actorSeed,
        uint256 tokenSeed,
        uint256 amountSeed,
        uint256 durationSeed,
        uint256 promiseSeed
    ) external {
        actionCount++;
        (address staker, address referee, address beneficiary) = _threeActors(actorSeed);
        address token = address(_token(tokenSeed));
        uint256 amount = bound(amountSeed, 1, MAX_STAKE);
        uint64 deadline = uint64(block.timestamp + bound(durationSeed, satStake.MIN_DURATION(), MAX_PLEDGE_DURATION));
        string memory promiseText = _promise(promiseSeed);
        bool blocked = _someoneBlocked();

        uint256 created;
        vm.prank(staker);
        try satStake.createPledge(token, amount, referee, beneficiary, deadline, promiseText) returns (uint256 id) {
            created = id;
            createCount++;
            if (blocked) successWhileSomeoneBlockedCount++;
            _rememberCreation(id);
            ghostLocked[token] += amount;
        } catch {
            rejectedCount++;
        }
        _sweepStatuses(created, staker);
    }

    function markKept(uint256 idSeed, uint256 callerSeed) external {
        actionCount++;
        _recordVerdict(idSeed, callerSeed, true);
    }

    function markBroken(uint256 idSeed, uint256 callerSeed) external {
        actionCount++;
        _recordVerdict(idSeed, callerSeed, false);
    }

    function settle(uint256 idSeed, uint256 callerSeed, uint256 pathSeed) external {
        actionCount++;
        // Each of the three rows of the recipient table is asked for in turn, so no path is left
        // unvisited because the fuzzer happened to prefer another.
        Wanted[3] memory paths = [Wanted.Kept, Wanted.Broken, Wanted.ExpiredActive];
        uint256 id = idSeed % 8 == 0 ? _anyIdentifier(idSeed) : _pick(idSeed, paths[pathSeed % 3]);
        address caller = actors[bound(callerSeed, 0, actors.length - 1)];

        _attemptSettle(id, caller);
        _sweepStatuses(id, caller);
    }

    /// @notice Blocks the recipient of a settleable pledge, tries to settle it, and lifts the block
    /// again. The isolation requirement needs failed transfers inside the sequences; leaving them to
    /// chance would let whole runs pass with none.
    function settleWithABlockedRecipient(uint256 idSeed) external {
        actionCount++;
        uint256 id = _pick(idSeed, Wanted.Settleable);
        if (id == 0 || id > satStake.pledgeCount()) {
            rejectedCount++;
            return;
        }
        SatStake.Pledge memory p = satStake.getPledge(id);
        address recipient = p.status == SatStake.Status.Kept ? p.staker : p.beneficiary;
        MockFiatToken token = MockFiatToken(p.token);
        address caller = actors[bound(idSeed, 0, actors.length - 1)];

        bool wasBlocked = token.isBlocklisted(recipient);
        token.blocklist(recipient);
        _attemptSettle(id, caller);
        if (!wasBlocked) token.unBlocklist(recipient);

        _sweepStatuses(id, caller);
    }

    function warp(uint256 secondsSeed) external {
        actionCount++;
        vm.warp(block.timestamp + bound(secondsSeed, 1, MAX_WARP));
        warpCount++;
        // A time jump stores nothing, so the sweep is what shows no status moved with the clock. No
        // pledge was named, so any transition it finds has no caller and fails the edge conditions.
        _sweepStatuses(0, address(0));
    }

    function setBlocklist(uint256 actorSeed, uint256 tokenSeed, uint256 onSeed) external {
        actionCount++;
        address actor = actors[bound(actorSeed, 0, actors.length - 1)];
        MockFiatToken token = _token(tokenSeed);
        // On for one call in four. Blocked more often than that and most of the sequence would be
        // refused transfers, which proves less than a mixture does.
        if (onSeed % 4 == 0) token.blocklist(actor);
        else token.unBlocklist(actor);
        issuerControlCount++;
        _sweepStatuses(0, address(0));
    }

    function setPause(uint256 tokenSeed, uint256 onSeed) external {
        actionCount++;
        MockFiatToken token = _token(tokenSeed);
        // Rarer than a blocklist, because a pause stops every transfer in that token at once.
        if (onSeed % 6 == 0) token.pause();
        else token.unpause();
        issuerControlCount++;
        _sweepStatuses(0, address(0));
    }

    // ---------------------------------------------------------------------------------------
    // Carrying out a settlement and recording what happened.
    // ---------------------------------------------------------------------------------------

    function _attemptSettle(uint256 id, address caller) private {
        uint256 count = satStake.pledgeCount();
        SatStake.Pledge memory p;
        bool settleable;
        if (id >= 1 && id <= count) {
            p = satStake.getPledge(id);
            settleable = p.status == SatStake.Status.Kept || p.status == SatStake.Status.Broken
                || (p.status == SatStake.Status.Active && block.timestamp >= p.deadline);
        }
        uint256 lockedBefore = settleable ? satStake.totalLocked(p.token) : 0;
        uint256 balanceBefore = settleable ? MockFiatToken(p.token).balanceOf(address(satStake)) : 0;
        bool blocked = _someoneBlocked();

        vm.recordLogs();
        vm.prank(caller);
        try satStake.settle(id) {
            if (blocked) successWhileSomeoneBlockedCount++;
            if (p.status == SatStake.Status.Kept) settleToStakerCount++;
            else if (p.status == SatStake.Status.Broken) settleBrokenCount++;
            else settleExpiredCount++;
            ghostLocked[p.token] -= p.amount;
        } catch {
            rejectedCount++;
            // A settleable pledge can only fail on the transfer: the checks before it passed, and the
            // contract's balance is at least the stake it owes. So the token refused, which is the
            // case the isolation requirement is about.
            if (settleable) {
                blockedTransferCount++;
                _failedSettles.push(
                    FailedSettle({
                        id: id,
                        statusBefore: uint8(p.status),
                        statusAfter: uint8(satStake.getPledge(id).status),
                        lockedBefore: lockedBefore,
                        lockedAfter: satStake.totalLocked(p.token),
                        balanceBefore: balanceBefore,
                        balanceAfter: MockFiatToken(p.token).balanceOf(address(satStake))
                    })
                );
                _probeOtherPledgesStillWork();
            }
        }
        _captureSettlements(vm.getRecordedLogs());
    }

    /// Runs a whole other pledge through creation, a verdict, and settlement while the refused
    /// transfer above is still refused, which is the requirement's own sentence: every other pledge
    /// remains creatable, verdict-able, and settleable. Each step is counted rather than asserted,
    /// and the invariant asserts no step was refused.
    ///
    /// The probe's own work is counted only in `probeCount`, never in the counters that show the
    /// fuzzer's actions reached each state. Otherwise a run whose verdicts and settlements were all
    /// probes would read as a run that had judged and settled pledges of its own. Its creations do
    /// count, because the identifier accounting has to see every pledge, and a probe cannot be the
    /// first creation in a run: it runs only after a settleable pledge's payout was refused.
    ///
    /// The parties and the token are chosen so that whatever refused the transfer does not also stand
    /// in the probe's way. A paused token refuses every transfer in that token, which is the token's
    /// doing and not the contract's, so a paused token is not used; nor is a blocklisted account used
    /// as the probe's staker, who both pays the stake in and receives it back. If no token and account
    /// are left, there is nothing this requirement could ask of the contract and the probe is skipped.
    function _probeOtherPledgesStillWork() private {
        (MockFiatToken token, address staker, address referee, address beneficiary) = _probeParties();
        if (address(token) == address(0)) return;

        uint64 deadline = uint64(block.timestamp + satStake.MIN_DURATION() + 1);
        uint256 id;
        vm.prank(staker);
        try satStake.createPledge(address(token), 1, referee, beneficiary, deadline, "probe") returns (uint256 newId) {
            id = newId;
            createCount++;
            _rememberCreation(id);
            ghostLocked[address(token)] += 1;
        } catch {
            probeFailureCount++;
        }
        // Swept after every step, because the sweep records the change it can see and three changes
        // to one pledge in a single action would otherwise be recorded as one jump from the first
        // status to the last.
        _sweepStatuses(id, staker);
        if (id == 0) return;

        bool judged;
        vm.prank(referee);
        try satStake.markKept(id) {
            judged = true;
        } catch {
            probeFailureCount++;
        }
        _sweepStatuses(id, referee);
        if (!judged) return;

        bool settled;
        vm.prank(beneficiary);
        try satStake.settle(id) {
            ghostLocked[address(token)] -= 1;
            settled = true;
        } catch {
            probeFailureCount++;
        }
        _sweepStatuses(id, beneficiary);
        if (settled) probeCount++;
    }

    /// A token and three distinct accounts the refusal's cause does not also block, or a zero token
    /// when there is no such combination.
    function _probeParties()
        private
        view
        returns (MockFiatToken token, address staker, address referee, address beneficiary)
    {
        MockFiatToken chosen;
        if (!usdc.paused()) chosen = usdc;
        else if (!cirbtc.paused()) chosen = cirbtc;
        else return (MockFiatToken(address(0)), address(0), address(0), address(0));

        uint256 stakerIndex = actors.length;
        for (uint256 i = 0; i < actors.length; i++) {
            if (!chosen.isBlocklisted(actors[i])) {
                stakerIndex = i;
                break;
            }
        }
        if (stakerIndex == actors.length) return (MockFiatToken(address(0)), address(0), address(0), address(0));

        token = chosen;
        staker = actors[stakerIndex];
        // Neither of the other two receives anything on this path, so a blocklist on them is no
        // obstacle; they only have to differ from each other and from the staker.
        uint256 assigned;
        for (uint256 i = 0; i < actors.length && assigned < 2; i++) {
            if (i == stakerIndex) continue;
            if (assigned == 0) referee = actors[i];
            else beneficiary = actors[i];
            assigned++;
        }
    }

    function _captureSettlements(Vm.Log[] memory logs) private {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(satStake)) continue;
            if (logs[i].topics[0] != SatStake.PledgeSettled.selector) continue;
            uint256 id = uint256(logs[i].topics[1]);
            settledEvents[id]++;
            settledRecipient[id] = address(uint160(uint256(logs[i].topics[2])));
            settledAmount[id] = abi.decode(logs[i].data, (uint256));
            settledEventTotal++;
            if (id > highestSettledId) highestSettledId = id;
        }
    }

    function _recordVerdict(uint256 idSeed, uint256 callerSeed, bool kept) private {
        uint256 id = idSeed % 8 == 0 ? _anyIdentifier(idSeed) : _pick(idSeed, Wanted.ActiveBeforeDeadline);
        // Mostly the pledge's own referee, so verdicts land; sometimes another account, so the
        // sequences also contain verdicts the contract must refuse for want of authority.
        address caller = actors[bound(callerSeed, 0, actors.length - 1)];
        if (callerSeed % 8 != 0 && id >= 1 && id <= satStake.pledgeCount()) {
            caller = satStake.getPledge(id).referee;
        }
        bool blocked = _someoneBlocked();

        if (kept) {
            vm.prank(caller);
            try satStake.markKept(id) {
                keptCount++;
                if (blocked) successWhileSomeoneBlockedCount++;
            } catch {
                rejectedCount++;
            }
        } else {
            vm.prank(caller);
            try satStake.markBroken(id) {
                brokenCount++;
                if (blocked) successWhileSomeoneBlockedCount++;
            } catch {
                rejectedCount++;
            }
        }
        _sweepStatuses(id, caller);
    }

    // ---------------------------------------------------------------------------------------
    // Bookkeeping the invariants read.
    // ---------------------------------------------------------------------------------------

    /// The record of `id` as it stood at creation, written on first sight only. Refreshing it from
    /// the contract on a later sighting would hide the very change it exists to detect, and a second
    /// sighting of one identifier as new is itself a fault, so it is counted rather than overwritten.
    function _rememberCreation(uint256 id) private {
        if (_createdAs[id].staker != address(0)) {
            reusedIdentifierCount++;
            return;
        }
        _createdAs[id] = satStake.getPledge(id);
    }

    /// Appends a transition for every pledge whose stored status differs from the one last seen, with
    /// the caller of the call that named `actedId` and whether that pledge's deadline had been
    /// reached. Every pledge is swept rather than only the one an action named, so a status changed as
    /// a side effect of another pledge's call, or by a time jump, is recorded too; such a transition
    /// has no caller and so cannot satisfy an edge condition that names one.
    function _sweepStatuses(uint256 actedId, address actedCaller) private {
        uint256 count = satStake.pledgeCount();
        for (uint256 id = 1; id <= count; id++) {
            SatStake.Pledge memory p = satStake.getPledge(id);
            if (p.status == _lastStatus[id]) continue;
            _transitions.push(
                Transition({
                    id: id,
                    from: uint8(_lastStatus[id]),
                    to: uint8(p.status),
                    caller: id == actedId ? actedCaller : address(0),
                    deadlineReached: block.timestamp >= p.deadline
                })
            );
            _lastStatus[id] = p.status;
        }
    }

    function transitions() external view returns (Transition[] memory) {
        return _transitions;
    }

    function failedSettles() external view returns (FailedSettle[] memory) {
        return _failedSettles;
    }

    function createdAs(uint256 id) external view returns (SatStake.Pledge memory) {
        return _createdAs[id];
    }

    function callSummary() external view {
        console.log("actions                      ", actionCount);
        console.log("creates                      ", createCount);
        console.log("verdicts kept                ", keptCount);
        console.log("verdicts broken              ", brokenCount);
        console.log("settlements to the staker    ", settleToStakerCount);
        console.log("settlements of a broken      ", settleBrokenCount);
        console.log("settlements of an expired    ", settleExpiredCount);
        console.log("transfers refused by a token ", blockedTransferCount);
        console.log("probes after a refusal       ", probeCount);
        console.log("time jumps                   ", warpCount);
        console.log("issuer control changes       ", issuerControlCount);
        console.log("successes while blocked      ", successWhileSomeoneBlockedCount);
        console.log("calls the contract refused   ", rejectedCount);
        console.log("status transitions recorded  ", _transitions.length);
        console.log("settlement events captured   ", settledEventTotal);
    }

    // ---------------------------------------------------------------------------------------
    // Choosing inputs.
    // ---------------------------------------------------------------------------------------

    /// A pledge in the wanted state, or any settleable one, or an identifier that may not exist. The
    /// fallbacks keep the call happening: a call that returned early would spend a step of the
    /// sequence on nothing.
    function _pick(uint256 seed, Wanted wanted) private view returns (uint256) {
        uint256 count = satStake.pledgeCount();
        if (count == 0) return _anyIdentifier(seed);

        uint256[] memory matches = new uint256[](count);
        uint256 found;
        for (uint256 id = 1; id <= count; id++) {
            if (_matches(id, wanted)) matches[found++] = id;
        }
        if (found > 0) return matches[seed % found];

        if (wanted != Wanted.Settleable && wanted != Wanted.Any) return _pick(seed, Wanted.Settleable);
        return _anyIdentifier(seed);
    }

    function _matches(uint256 id, Wanted wanted) private view returns (bool) {
        SatStake.Pledge memory p = satStake.getPledge(id);
        bool expired = p.status == SatStake.Status.Active && block.timestamp >= p.deadline;
        if (wanted == Wanted.Any) return true;
        if (wanted == Wanted.ActiveBeforeDeadline) {
            return p.status == SatStake.Status.Active && !expired && id % RESERVED_FOR_EXPIRY != 0;
        }
        if (wanted == Wanted.Kept) return p.status == SatStake.Status.Kept;
        if (wanted == Wanted.Broken) return p.status == SatStake.Status.Broken;
        if (wanted == Wanted.ExpiredActive) return expired;
        return p.status == SatStake.Status.Kept || p.status == SatStake.Status.Broken || expired;
    }

    /// An identifier anywhere in the assigned range or just outside it, so nonexistent pledges are
    /// asked for as well.
    function _anyIdentifier(uint256 seed) private view returns (uint256) {
        return bound(seed, 0, satStake.pledgeCount() + 2);
    }

    /// Three different actors for the staker, the referee, and the beneficiary. The contract refuses
    /// any repeat among them, so a sequence that never picked three would create nothing.
    function _threeActors(uint256 seed) private view returns (address staker, address referee, address beneficiary) {
        uint256 i = seed % 4;
        uint256[3] memory others;
        uint256 n;
        for (uint256 j = 0; j < 4; j++) {
            if (j != i) others[n++] = j;
        }
        uint256 a = (seed / 4) % 3;
        uint256 b = (seed / 12) % 2;
        staker = actors[i];
        referee = actors[others[a]];
        // The two indices left once the referee is taken.
        uint256[2] memory rest;
        uint256 m;
        for (uint256 j = 0; j < 3; j++) {
            if (j != a) rest[m++] = others[j];
        }
        beneficiary = actors[rest[b]];
    }

    function _token(uint256 seed) private view returns (MockFiatToken) {
        return seed % 2 == 0 ? usdc : cirbtc;
    }

    /// A promise of any permitted length, since the length decides whether the text occupies one
    /// storage slot or several.
    function _promise(uint256 seed) private view returns (string memory) {
        uint256 length = bound(seed, 1, satStake.MAX_PROMISE_BYTES());
        bytes memory text = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            text[i] = "p";
        }
        return string(text);
    }

    function _someoneBlocked() private view returns (bool) {
        for (uint256 i = 0; i < actors.length; i++) {
            if (usdc.isBlocklisted(actors[i]) || cirbtc.isBlocklisted(actors[i])) return true;
        }
        return false;
    }
}
