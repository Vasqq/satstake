// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SatStake} from "../../src/SatStake.sol";
import {SatStakeTestBase} from "../base/SatStakeTestBase.sol";
import {MockFiatToken} from "../mocks/MockFiatToken.sol";
import {SatStakeHandler} from "./SatStakeHandler.sol";

/// @notice The properties that must hold after every call, over arbitrary sequences of create,
/// verdict, settle, time jumps, and token blocklist and pause changes. The handler makes the calls
/// and records what it saw; every assertion here is computed from the contract or from that record,
/// never from the same arithmetic the contract used.
contract SatStakeInvariantTest is SatStakeTestBase {
    // Long enough for every action and every settlement path to be reached many times, which the
    // sequence test checks and depends on.
    uint256 internal constant SEQUENCE_STEPS = 300;
    uint256 internal constant ACTIONS = 8;

    SatStakeHandler internal handler;
    MockFiatToken internal usdc;
    MockFiatToken internal cirbtc;

    // The actions the fuzzer was given, kept so that a test can check the list rather than trust it.
    bytes4[] internal registeredSelectors;

    function setUp() public {
        // A timestamp far from zero, so that time before a deadline is still a positive number.
        vm.warp(1_700_000_000);

        // The handler deploys the tokens, so it is their issuer and can work their controls.
        handler = new SatStakeHandler();
        usdc = handler.usdc();
        cirbtc = handler.cirbtc();

        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(cirbtc);
        satStake = new SatStake(tokens);
        handler.initialize(satStake);

        bytes4[] memory selectors = new bytes4[](ACTIONS);
        selectors[0] = SatStakeHandler.createPledge.selector;
        selectors[1] = SatStakeHandler.markKept.selector;
        selectors[2] = SatStakeHandler.markBroken.selector;
        selectors[3] = SatStakeHandler.settle.selector;
        selectors[4] = SatStakeHandler.settleWithABlockedRecipient.selector;
        selectors[5] = SatStakeHandler.warp.selector;
        selectors[6] = SatStakeHandler.setBlocklist.selector;
        selectors[7] = SatStakeHandler.setPause.selector;
        registeredSelectors = selectors;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    // ---------------------------------------------------------------------------------------
    // The stake the contract holds (LLR-SC-070, LLR-SC-071).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-070
    function invariant_SC070_theBalanceCoversTheLockedStakeOfEveryToken() public view {
        address[] memory tokens = satStake.allowedTokens();
        for (uint256 i = 0; i < tokens.length; i++) {
            assertGe(IERC20(tokens[i]).balanceOf(address(satStake)), satStake.totalLocked(tokens[i]));
        }
    }

    /// The sum is walked out of the pledges themselves, so a locked total kept by different
    /// arithmetic than the records cannot agree with itself. The handler's own running total is
    /// compared as well, which catches the two of them drifting together.
    /// @custom:verifies LLR-SC-071
    function invariant_SC071_theLockedStakeIsTheSumOfEveryUnsettledPledge() public view {
        address[] memory tokens = satStake.allowedTokens();
        uint256[] memory sums = new uint256[](tokens.length);

        uint256 count = satStake.pledgeCount();
        for (uint256 id = 1; id <= count; id++) {
            SatStake.Pledge memory p = satStake.getPledge(id);
            if (
                p.status != SatStake.Status.Active && p.status != SatStake.Status.Kept
                    && p.status != SatStake.Status.Broken
            ) continue;
            for (uint256 i = 0; i < tokens.length; i++) {
                if (p.token == tokens[i]) sums[i] += p.amount;
            }
        }

        for (uint256 i = 0; i < tokens.length; i++) {
            assertEq(satStake.totalLocked(tokens[i]), sums[i]);
            assertEq(handler.ghostLocked(tokens[i]), sums[i]);
        }
    }

    // ---------------------------------------------------------------------------------------
    // The state machine (LLR-SC-072).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-072
    function invariant_SC072_everyStatusChangeFollowsAnEdgeOfTheStateMachine() public view {
        SatStakeHandler.Transition[] memory recorded = handler.transitions();
        for (uint256 i = 0; i < recorded.length; i++) {
            SatStakeHandler.Transition memory t = recorded[i];
            // The referee is a field of the record, which LLR-SC-074 holds fixed, so reading it now
            // gives the referee the pledge had when the transition happened.
            bool callerIsReferee = t.caller != address(0) && t.caller == satStake.getPledge(t.id).referee;
            assertTrue(
                _isLegalEdge(t.from, t.to, callerIsReferee, t.deadlineReached),
                string.concat(
                    "pledge ",
                    vm.toString(t.id),
                    " moved from status ",
                    vm.toString(t.from),
                    " to ",
                    vm.toString(t.to),
                    callerIsReferee ? " by its referee" : " by another account",
                    t.deadlineReached ? ", deadline reached" : ", deadline ahead"
                )
            );
        }
    }

    /// The table of 05 section 1.2, edge by edge and label by label. Enumerated here rather than
    /// derived, so an edge the diagram does not have, or an edge taken without the condition its label
    /// carries, fails even if some rule could be written that permits it.
    /// @custom:verifies LLR-SC-072
    function test_SC072_theLegalEdgeTableIsExactlyTheDiagram() public pure {
        uint8 none = uint8(SatStake.Status.None);
        uint8 active = uint8(SatStake.Status.Active);
        uint8 kept = uint8(SatStake.Status.Kept);
        uint8 broken = uint8(SatStake.Status.Broken);
        uint8 toStaker = uint8(SatStake.Status.SettledToStaker);
        uint8 toBeneficiary = uint8(SatStake.Status.SettledToBeneficiary);

        uint8 states = uint8(type(SatStake.Status).max) + 1;
        for (uint8 from = 0; from < states; from++) {
            for (uint8 to = 0; to < states; to++) {
                for (uint256 g = 0; g < 4; g++) {
                    bool byReferee = g & 1 != 0;
                    bool deadlineReached = g & 2 != 0;

                    // One line per edge of the diagram. The conditions are disjoint, so the order of
                    // the lines carries no meaning and an edge left out stays false.
                    bool expected = from == to; // the call left the status alone
                    // createPledge
                    if (from == none && to == active) expected = true;
                    // markKept, markBroken (referee, now < deadline)
                    if (from == active && (to == kept || to == broken)) expected = byReferee && !deadlineReached;
                    // settle (anyone, now >= deadline)
                    if (from == active && to == toBeneficiary) expected = deadlineReached;
                    // settle (anyone)
                    if (from == kept && to == toStaker) expected = true;
                    // settle (anyone)
                    if (from == broken && to == toBeneficiary) expected = true;

                    assertEq(
                        _isLegalEdge(from, to, byReferee, deadlineReached),
                        expected,
                        string.concat(
                            "edge ",
                            vm.toString(from),
                            " to ",
                            vm.toString(to),
                            byReferee ? ", by the referee" : ", by another account",
                            deadlineReached ? ", deadline reached" : ", deadline ahead"
                        )
                    );
                }
            }
        }
    }

    function _isLegalEdge(uint8 from, uint8 to, bool callerIsReferee, bool deadlineReached)
        internal
        pure
        returns (bool)
    {
        if (from == to) return true; // the call left the status alone
        if (from == uint8(SatStake.Status.None) && to == uint8(SatStake.Status.Active)) return true;
        if (from == uint8(SatStake.Status.Active) && to == uint8(SatStake.Status.Kept)) {
            return callerIsReferee && !deadlineReached;
        }
        if (from == uint8(SatStake.Status.Active) && to == uint8(SatStake.Status.Broken)) {
            return callerIsReferee && !deadlineReached;
        }
        if (from == uint8(SatStake.Status.Active) && to == uint8(SatStake.Status.SettledToBeneficiary)) {
            return deadlineReached;
        }
        if (from == uint8(SatStake.Status.Kept) && to == uint8(SatStake.Status.SettledToStaker)) return true;
        if (from == uint8(SatStake.Status.Broken) && to == uint8(SatStake.Status.SettledToBeneficiary)) return true;
        return false;
    }

    // ---------------------------------------------------------------------------------------
    // Settlement events (LLR-SC-073).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-073
    function invariant_SC073_eachPledgeSettlesAtMostOnceToOneOfItsOwnParties() public view {
        uint256 count = satStake.pledgeCount();
        // An event naming an identifier no pledge holds would fall outside the walk below.
        assertLe(handler.highestSettledId(), count);
        assertLe(handler.settledEventTotal(), count);

        for (uint256 id = 1; id <= count; id++) {
            uint256 events = handler.settledEvents(id);
            assertLe(events, 1, string.concat("pledge ", vm.toString(id), " settled more than once"));
            if (events == 0) continue;

            SatStake.Pledge memory p = satStake.getPledge(id);
            address recipient = handler.settledRecipient(id);
            assertTrue(recipient == p.staker || recipient == p.beneficiary, "settled to a stranger");
            assertEq(handler.settledAmount(id), p.amount);
        }
    }

    // ---------------------------------------------------------------------------------------
    // The record is written once (LLR-SC-074).
    // ---------------------------------------------------------------------------------------

    /// Field by field against the record as it stood at creation, which the handler writes on first
    /// sight and never refreshes. A hash of the record would compare the same fields only if the hash
    /// were computed right, and would say nothing about which field moved when it failed. The status is
    /// left out here: it is allowed to change, along the edges LLR-SC-072 names.
    /// @custom:verifies LLR-SC-074
    function invariant_SC074_noFieldOfAPledgeChangesAfterCreation() public view {
        // An identifier handed out twice would put a second pledge's fields in the first one's record,
        // which the comparison below cannot see, because the record it compares against is the one the
        // handler already holds for that identifier.
        assertEq(handler.reusedIdentifierCount(), 0, "one identifier was created twice");

        uint256 count = satStake.pledgeCount();
        for (uint256 id = 1; id <= count; id++) {
            SatStake.Pledge memory current = satStake.getPledge(id);
            SatStake.Pledge memory atCreation = handler.createdAs(id);
            string memory which = string.concat("pledge ", vm.toString(id), ": ");
            assertEq(current.staker, atCreation.staker, string.concat(which, "staker"));
            assertEq(current.token, atCreation.token, string.concat(which, "token"));
            assertEq(current.amount, atCreation.amount, string.concat(which, "amount"));
            assertEq(current.referee, atCreation.referee, string.concat(which, "referee"));
            assertEq(current.beneficiary, atCreation.beneficiary, string.concat(which, "beneficiary"));
            assertEq(current.deadline, atCreation.deadline, string.concat(which, "deadline"));
            assertEq(current.createdAt, atCreation.createdAt, string.concat(which, "createdAt"));
            assertEq(current.promiseText, atCreation.promiseText, string.concat(which, "promiseText"));
        }
    }

    // ---------------------------------------------------------------------------------------
    // A refused transfer (LLR-SC-045) and what it must not reach (LLR-SC-075).
    // ---------------------------------------------------------------------------------------

    /// Every settlement the token refused, checked either side of the attempt: the pledge's status,
    /// the locked stake, and the contract's balance are as they were. This is the sentence the settle
    /// group proved for single calls, held here over arbitrary sequences.
    /// @custom:verifies LLR-SC-045
    function invariant_SC045_aRefusedTransferChangesNothing() public view {
        SatStakeHandler.FailedSettle[] memory failures = handler.failedSettles();
        for (uint256 i = 0; i < failures.length; i++) {
            string memory which = string.concat("failed settle of pledge ", vm.toString(failures[i].id), ": ");
            assertEq(failures[i].statusAfter, failures[i].statusBefore, string.concat(which, "status"));
            assertEq(failures[i].lockedAfter, failures[i].lockedBefore, string.concat(which, "locked"));
            assertEq(failures[i].balanceAfter, failures[i].balanceBefore, string.concat(which, "balance"));
        }
    }

    /// The requirement's own sentence, asserted where it applies. Whenever a token refuses a pledge's
    /// payout, the handler takes another pledge through creation, a verdict, and settlement while that
    /// refusal still stands, using a token and parties the refusal's cause does not also block. Every
    /// step of every such probe must have succeeded.
    /// @custom:verifies LLR-SC-075
    function invariant_SC075_aRefusedTransferStopsNoOtherPledge() public view {
        assertEq(
            handler.probeFailureCount(),
            0,
            "a pledge could not be created, judged, or settled while another pledge's payout was refused"
        );

        // Creation also kept taking the next identifier: no refused transfer consumed one.
        assertEq(satStake.pledgeCount(), handler.createCount());
    }

    // ---------------------------------------------------------------------------------------
    // The sequences were not vacuous.
    // ---------------------------------------------------------------------------------------

    /// The first guard on every invariant above: the fuzzer can only reach a state through an action
    /// it was given, so a selector list that lost the creation action would leave the walks with
    /// nothing to walk and every one of them would pass. A duplicate entry is the same fault by
    /// another route, since it displaces whichever action it replaced. Nothing here depends on a
    /// random draw, which is why it is the guard and the counters are the backstop.
    /// @custom:verifies LLR-SC-070 LLR-SC-071 LLR-SC-072 LLR-SC-073 LLR-SC-074 LLR-SC-075
    function test_SC070_theFuzzerIsGivenEveryHandlerActionExactlyOnce() public view {
        bytes4[8] memory expected = [
            SatStakeHandler.createPledge.selector,
            SatStakeHandler.markKept.selector,
            SatStakeHandler.markBroken.selector,
            SatStakeHandler.settle.selector,
            SatStakeHandler.settleWithABlockedRecipient.selector,
            SatStakeHandler.warp.selector,
            SatStakeHandler.setBlocklist.selector,
            SatStakeHandler.setPause.selector
        ];
        assertEq(registeredSelectors.length, ACTIONS, "the fuzzer was given a different number of actions");

        for (uint256 i = 0; i < registeredSelectors.length; i++) {
            for (uint256 j = i + 1; j < registeredSelectors.length; j++) {
                assertTrue(
                    registeredSelectors[i] != registeredSelectors[j],
                    string.concat("action ", vm.toString(i), " and action ", vm.toString(j), " are the same selector")
                );
            }
        }

        // Both directions: an action dropped from the list and an action never written into it both
        // fail here.
        for (uint256 e = 0; e < expected.length; e++) {
            bool given;
            for (uint256 i = 0; i < registeredSelectors.length; i++) {
                if (registeredSelectors[i] == expected[e]) given = true;
            }
            assertTrue(given, string.concat("handler action ", vm.toString(e), " was not given to the fuzzer"));
        }
        for (uint256 i = 0; i < registeredSelectors.length; i++) {
            bool known;
            for (uint256 e = 0; e < expected.length; e++) {
                if (registeredSelectors[i] == expected[e]) known = true;
            }
            assertTrue(known, string.concat("selector ", vm.toString(i), " is not a handler action"));
        }
    }

    /// `fail_on_revert` is false, so a run whose every call reverted would satisfy every invariant
    /// above while exercising nothing. The summary printed here is what each run actually did, and
    /// `actionCount` is the only counter that cannot fail on a correct contract, since every action
    /// increments it whether the call it made succeeded or reverted.
    ///
    /// No counter of successful calls belongs here, creation included. A sequence is 128 calls over 8
    /// actions, and the pause and blocklist states persist between the calls that set them, so a
    /// sequence that pauses both tokens or blocklists every actor early fails every creation after it:
    /// with `FOUNDRY_FUZZ_SEED=2` or `7` over the whole file, a correct contract produces a sequence
    /// whose 128 calls create nothing. Asserting creation here failed about one run in three and shrank
    /// to a counterexample of five pause and blocklist calls, which says nothing about the contract.
    /// The three settlement paths are worse: they compete for the same pledges, and a full lifecycle
    /// can complete about 14 times at best.
    ///
    /// Non-vacuity is guarded where it cannot flake instead. The selector test above pins the action
    /// space the fuzzer is given, which is the fault this would have caught, and the sequence test
    /// below asserts every counter over a fixed 300 calls while checking every invariant after each.
    function afterInvariant() public view {
        handler.callSummary();
        assertGt(handler.actionCount(), 0, "the sequence executed no action");
    }

    /// One sequence of 300 calls, spread over every action by a fixed pseudo-random stream, with
    /// every invariant checked after every call. Deterministic, so the counters below are a promise
    /// about the handler's reach rather than a hope about a random draw: every action and each of the
    /// three settlement paths is exercised, which is what makes the invariants above non-vacuous.
    /// @custom:verifies LLR-SC-045 LLR-SC-070 LLR-SC-071 LLR-SC-072 LLR-SC-073 LLR-SC-074 LLR-SC-075
    function test_SC070_everyInvariantHoldsOverALongSequenceThatReachesEveryAction() public {
        for (uint256 step = 0; step < SEQUENCE_STEPS; step++) {
            // Both through an external call to this contract, so that each step's memory is released
            // when it returns. Held in one frame, the records read by 300 steps exhaust memory.
            this.act(uint256(keccak256(abi.encode("SatStake sequence", step))));
            this.checkEveryInvariant();
        }

        handler.callSummary();
        assertGt(handler.createCount(), 0, "no pledge was created");
        assertGt(handler.keptCount(), 0, "no promise was judged kept");
        assertGt(handler.brokenCount(), 0, "no promise was judged broken");
        assertGt(handler.settleToStakerCount(), 0, "no kept pledge was settled");
        assertGt(handler.settleBrokenCount(), 0, "no broken pledge was settled");
        assertGt(handler.settleExpiredCount(), 0, "no expired pledge was settled");
        assertGt(handler.blockedTransferCount(), 0, "no token ever refused a transfer");
        assertGt(handler.probeCount(), 0, "no other pledge was taken through its lifecycle after a refusal");
        assertGt(handler.warpCount(), 0, "time never moved");
        assertGt(handler.issuerControlCount(), 0, "no blocklist or pause was changed");
        assertGt(handler.successWhileSomeoneBlockedCount(), 0, "nothing succeeded while an account was blocked");
        assertGt(handler.rejectedCount(), 0, "the contract never refused a call");
        // Enough pledges for the walks above to be walks over many records rather than one or two.
        assertGt(satStake.pledgeCount(), 20);
    }

    /// @notice Every invariant of this group, in one call.
    function checkEveryInvariant() external view {
        invariant_SC070_theBalanceCoversTheLockedStakeOfEveryToken();
        invariant_SC071_theLockedStakeIsTheSumOfEveryUnsettledPledge();
        invariant_SC072_everyStatusChangeFollowsAnEdgeOfTheStateMachine();
        invariant_SC073_eachPledgeSettlesAtMostOnceToOneOfItsOwnParties();
        invariant_SC074_noFieldOfAPledgeChangesAfterCreation();
        invariant_SC045_aRefusedTransferChangesNothing();
        invariant_SC075_aRefusedTransferStopsNoOtherPledge();
    }

    /// @notice The same eight actions the fuzzer is given, chosen by the seed. `ACTIONS` is the length
    /// of the selector list in `setUp`, so the two are the same size by construction.
    function act(uint256 seed) external {
        uint256 a = uint256(keccak256(abi.encode(seed, "a")));
        uint256 b = uint256(keccak256(abi.encode(seed, "b")));
        uint256 c = uint256(keccak256(abi.encode(seed, "c")));

        uint256 action = seed % ACTIONS;
        if (action == 0) handler.createPledge(seed, a, b, c, uint256(keccak256(abi.encode(seed, "d"))));
        else if (action == 1) handler.markKept(seed, a);
        else if (action == 2) handler.markBroken(seed, a);
        else if (action == 3) handler.settle(seed, a, b);
        else if (action == 4) handler.settleWithABlockedRecipient(seed);
        else if (action == 5) handler.warp(seed);
        else if (action == 6) handler.setBlocklist(seed, a, b);
        else handler.setPause(seed, a);
    }
}
