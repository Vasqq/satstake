// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Test.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SatStake} from "../src/SatStake.sol";
import {SatStakeTestBase} from "./base/SatStakeTestBase.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";
import {MockFeeToken} from "./mocks/MockFeeToken.sol";
import {MockHostileToken} from "./mocks/MockHostileToken.sol";

/// @notice Creating a pledge: identifiers, the checks and their order, the stake transfer, the
/// stored record, the bookkeeping, and the event.
contract SatStakeCreateTest is SatStakeTestBase {
    uint64 internal constant MIN_DURATION = 60;
    uint64 internal constant MAX_DURATION = 365 days;
    uint256 internal constant MAX_PROMISE_BYTES = 280;

    MockFiatToken internal usdc;
    MockFiatToken internal cirbtc;
    MockFeeToken internal feeToken;
    MockHostileToken internal hostile;
    MockFiatToken internal unallowed;

    // Holds no token and has approved nothing.
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        // A timestamp far from zero, so that a deadline one second before the minimum is still
        // a positive number.
        vm.warp(1_700_000_000);

        usdc = new MockFiatToken(6);
        cirbtc = new MockFiatToken(8);
        feeToken = new MockFeeToken(100);
        hostile = new MockHostileToken();
        unallowed = new MockFiatToken(6);

        address[] memory tokens = new address[](4);
        tokens[0] = address(usdc);
        tokens[1] = address(cirbtc);
        tokens[2] = address(feeToken);
        tokens[3] = address(hostile);
        satStake = new SatStake(tokens);

        for (uint256 i = 0; i < tokens.length; i++) {
            _fund(tokens[i], staker);
            _fund(tokens[i], outsider);
        }
        _fund(address(unallowed), staker);
    }

    // ---------------------------------------------------------------------------------------
    // Calling createPledge.
    // ---------------------------------------------------------------------------------------

    function _defaultDeadline() internal view returns (uint64) {
        return uint64(block.timestamp + 1 days);
    }

    function _create(
        address caller,
        address token,
        uint256 amount,
        address ref,
        address ben,
        uint64 deadline,
        string memory promiseText
    ) internal returns (uint256 id) {
        vm.prank(caller);
        id = satStake.createPledge(token, amount, ref, ben, deadline, promiseText);
    }

    function _createDefault() internal returns (uint256 id) {
        id = _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");
    }

    // `n` one-byte characters.
    function _ascii(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i = 0; i < n; i++) {
            b[i] = "a";
        }
        return string(b);
    }

    // `n` copies of the two-byte character U+00E9, so the byte length is twice the character count.
    function _twoByteChars(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(2 * n);
        for (uint256 i = 0; i < n; i++) {
            b[2 * i] = bytes1(0xC3);
            b[2 * i + 1] = bytes1(0xA9);
        }
        return string(b);
    }

    // ---------------------------------------------------------------------------------------
    // Success, identifiers, and the stored record.
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-020
    function test_SC020_createsActivePledgeForTheCaller() public {
        uint64 deadline = _defaultDeadline();
        uint256 id = _create(staker, address(usdc), 1000, referee, beneficiary, deadline, "Ship the demo");

        assertEq(id, 1);
        SatStake.Pledge memory p = _storedPledge(id);
        assertEq(p.staker, staker);
        assertEq(p.createdAt, uint64(block.timestamp));
        assertEq(uint8(p.status), uint8(SatStake.Status.Active));
    }

    /// @custom:verifies LLR-SC-020
    function test_SC020_createdAtIsTheBlockTimestampOfTheCall() public {
        vm.warp(1_800_000_123);
        uint256 id = _create(staker, address(usdc), 1000, referee, beneficiary, uint64(block.timestamp + 600), "Now");
        assertEq(_storedPledge(id).createdAt, 1_800_000_123);
    }

    /// @custom:verifies LLR-SC-010 LLR-SC-020
    function test_SC010_storedRecordHoldsEveryFieldOfTheInterface() public {
        // Distinct values in every field, so a field written from the wrong argument is visible.
        uint64 deadline = uint64(block.timestamp + 12_345);
        string memory promiseText = unicode"Run 5 km every day for a month é✓";
        uint256 id = _create(staker, address(cirbtc), 7777, referee, beneficiary, deadline, promiseText);

        SatStake.Pledge memory p = _storedPledge(id);
        assertEq(p.staker, staker);
        assertEq(p.token, address(cirbtc));
        assertEq(p.amount, 7777);
        assertEq(p.referee, referee);
        assertEq(p.beneficiary, beneficiary);
        assertEq(p.deadline, deadline);
        assertEq(p.createdAt, uint64(block.timestamp));
        assertEq(uint8(p.status), uint8(SatStake.Status.Active));
        assertEq(p.promiseText, promiseText);
    }

    /// @custom:verifies LLR-SC-010 LLR-SC-020
    function test_SC010_storedRecordKeepsEachPledgeApart() public {
        uint64 firstDeadline = uint64(block.timestamp + 600);
        uint256 first = _create(staker, address(usdc), 11, referee, beneficiary, firstDeadline, "first");

        vm.warp(block.timestamp + 100);
        uint64 secondDeadline = uint64(block.timestamp + 900);
        uint256 second = _create(outsider, address(cirbtc), 22, beneficiary, referee, secondDeadline, "second");

        SatStake.Pledge memory a = _storedPledge(first);
        SatStake.Pledge memory b = _storedPledge(second);
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

    /// @custom:verifies LLR-SC-010 LLR-SC-020
    function test_SC010_storedPromiseTextSurvivesEveryLength() public {
        // A one-slot string, the longest that still fits in one slot, the longest allowed, and a
        // multi-byte one: the stored form differs between the short and the long case.
        string[4] memory promises;
        promises[0] = "x";
        promises[1] = _ascii(31);
        promises[2] = _ascii(MAX_PROMISE_BYTES);
        promises[3] = string.concat(unicode"日本語 ", _twoByteChars(100), unicode" tail");
        for (uint256 i = 0; i < promises.length; i++) {
            uint256 id = _create(staker, address(usdc), 1, referee, beneficiary, _defaultDeadline(), promises[i]);
            assertEq(_storedPledge(id).promiseText, promises[i]);
        }
    }

    /// @custom:verifies LLR-SC-012
    function test_SC012_identifiersStartAtOneAndIncrementByOne() public {
        assertEq(_createDefault(), 1);
        assertEq(_createDefault(), 2);
        assertEq(_createDefault(), 3);
        // The record sits at the identifier the call returned.
        assertEq(_storedPledge(3).staker, staker);
        assertEq(_storedPledge(4).staker, address(0));
    }

    /// @custom:verifies LLR-SC-012
    function test_SC012_noIdentifierIsAssignedBeforeTheFirstPledge() public {
        assertEq(_storedPledge(0).staker, address(0));
        assertEq(uint8(_storedPledge(1).status), uint8(SatStake.Status.None));
        assertEq(_createDefault(), 1);
    }

    /// @custom:verifies LLR-SC-012
    function test_SC012_aRevertedCreateConsumesNoIdentifier() public {
        assertEq(_createDefault(), 1);
        vm.expectRevert(SatStake.ZeroAmount.selector);
        _create(staker, address(usdc), 0, referee, beneficiary, _defaultDeadline(), "Ship the demo");
        assertEq(_createDefault(), 2);
    }

    // ---------------------------------------------------------------------------------------
    // The checks.
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-021
    function test_SC021_revertsWhenTheTokenIsNotAllowed() public {
        address[3] memory rejected = [address(unallowed), address(0), outsider];
        for (uint256 i = 0; i < rejected.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(SatStake.TokenNotAllowed.selector, rejected[i]));
            _create(staker, rejected[i], 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");
        }
        // Every allowlisted token is accepted.
        _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");
        _create(staker, address(cirbtc), 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");
    }

    /// @custom:verifies LLR-SC-022
    function test_SC022_revertsWhenTheAmountIsZero() public {
        vm.expectRevert(SatStake.ZeroAmount.selector);
        _create(staker, address(usdc), 0, referee, beneficiary, _defaultDeadline(), "Ship the demo");
        // One unit is enough.
        _create(staker, address(usdc), 1, referee, beneficiary, _defaultDeadline(), "Ship the demo");
    }

    /// @custom:verifies LLR-SC-023
    function test_SC023_revertsWhenTheRefereeOrTheBeneficiaryIsZero() public {
        vm.expectRevert(SatStake.ZeroAddress.selector);
        _create(staker, address(usdc), 1000, address(0), beneficiary, _defaultDeadline(), "Ship the demo");
        vm.expectRevert(SatStake.ZeroAddress.selector);
        _create(staker, address(usdc), 1000, referee, address(0), _defaultDeadline(), "Ship the demo");
    }

    /// @custom:verifies LLR-SC-023
    function test_SC023_revertsWhenTheRefereeOrTheBeneficiaryIsTheContract() public {
        vm.expectRevert(SatStake.PartyIsContract.selector);
        _create(staker, address(usdc), 1000, address(satStake), beneficiary, _defaultDeadline(), "Ship the demo");
        vm.expectRevert(SatStake.PartyIsContract.selector);
        _create(staker, address(usdc), 1000, referee, address(satStake), _defaultDeadline(), "Ship the demo");
    }

    /// @custom:verifies LLR-SC-023
    function test_SC023_revertsWhenTheRefereeOrTheBeneficiaryIsTheStaker() public {
        vm.expectRevert(SatStake.PartyIsStaker.selector);
        _create(staker, address(usdc), 1000, staker, beneficiary, _defaultDeadline(), "Ship the demo");
        vm.expectRevert(SatStake.PartyIsStaker.selector);
        _create(staker, address(usdc), 1000, referee, staker, _defaultDeadline(), "Ship the demo");
        // The staker of the call, not the deployer of the contract.
        vm.expectRevert(SatStake.PartyIsStaker.selector);
        _create(outsider, address(usdc), 1000, outsider, beneficiary, _defaultDeadline(), "Ship the demo");
    }

    /// @custom:verifies LLR-SC-023
    function test_SC023_appliesZeroThenContractThenStakerToBothParties() public {
        uint64 deadline = _defaultDeadline();
        // Zero wins over contract and over staker, whichever party holds it.
        vm.expectRevert(SatStake.ZeroAddress.selector);
        _create(staker, address(usdc), 1000, address(0), address(satStake), deadline, "Ship the demo");
        vm.expectRevert(SatStake.ZeroAddress.selector);
        _create(staker, address(usdc), 1000, address(satStake), address(0), deadline, "Ship the demo");
        vm.expectRevert(SatStake.ZeroAddress.selector);
        _create(staker, address(usdc), 1000, staker, address(0), deadline, "Ship the demo");
        vm.expectRevert(SatStake.ZeroAddress.selector);
        _create(staker, address(usdc), 1000, address(0), staker, deadline, "Ship the demo");
        // Contract wins over staker, whichever party holds it.
        vm.expectRevert(SatStake.PartyIsContract.selector);
        _create(staker, address(usdc), 1000, address(satStake), staker, deadline, "Ship the demo");
        vm.expectRevert(SatStake.PartyIsContract.selector);
        _create(staker, address(usdc), 1000, staker, address(satStake), deadline, "Ship the demo");
    }

    /// @custom:verifies LLR-SC-024
    function test_SC024_revertsWhenTheRefereeIsTheBeneficiary() public {
        vm.expectRevert(SatStake.RefereeIsBeneficiary.selector);
        _create(staker, address(usdc), 1000, referee, referee, _defaultDeadline(), "Ship the demo");
        vm.expectRevert(SatStake.RefereeIsBeneficiary.selector);
        _create(staker, address(usdc), 1000, outsider, outsider, _defaultDeadline(), "Ship the demo");
    }

    /// @custom:verifies LLR-SC-025
    function test_SC025_acceptsADeadlineExactlyAtTheMinimum() public {
        uint64 earliest = uint64(block.timestamp) + MIN_DURATION;
        uint256 id = _create(staker, address(usdc), 1000, referee, beneficiary, earliest, "Ship the demo");
        assertEq(_storedPledge(id).deadline, earliest);
    }

    /// @custom:verifies LLR-SC-025
    function test_SC025_revertsOneSecondBeforeTheMinimum() public {
        uint64 earliest = uint64(block.timestamp) + MIN_DURATION;
        vm.expectRevert(abi.encodeWithSelector(SatStake.DeadlineTooSoon.selector, earliest));
        _create(staker, address(usdc), 1000, referee, beneficiary, earliest - 1, "Ship the demo");
        // Anything further in the past fails the same way, including a deadline already passed.
        vm.expectRevert(abi.encodeWithSelector(SatStake.DeadlineTooSoon.selector, earliest));
        _create(staker, address(usdc), 1000, referee, beneficiary, uint64(block.timestamp), "Ship the demo");
        vm.expectRevert(abi.encodeWithSelector(SatStake.DeadlineTooSoon.selector, earliest));
        _create(staker, address(usdc), 1000, referee, beneficiary, 0, "Ship the demo");
    }

    /// @custom:verifies LLR-SC-025
    function test_SC025_acceptsADeadlineExactlyAtTheMaximum() public {
        uint64 latest = uint64(block.timestamp) + MAX_DURATION;
        uint256 id = _create(staker, address(usdc), 1000, referee, beneficiary, latest, "Ship the demo");
        assertEq(_storedPledge(id).deadline, latest);
    }

    /// @custom:verifies LLR-SC-025
    function test_SC025_revertsOneSecondAfterTheMaximum() public {
        uint64 latest = uint64(block.timestamp) + MAX_DURATION;
        vm.expectRevert(abi.encodeWithSelector(SatStake.DeadlineTooFar.selector, latest));
        _create(staker, address(usdc), 1000, referee, beneficiary, latest + 1, "Ship the demo");
        vm.expectRevert(abi.encodeWithSelector(SatStake.DeadlineTooFar.selector, latest));
        _create(staker, address(usdc), 1000, referee, beneficiary, type(uint64).max, "Ship the demo");
    }

    /// @custom:verifies LLR-SC-025
    function test_SC025_boundsMoveWithTheBlockTimestamp() public {
        vm.warp(block.timestamp + 5000);
        uint64 earliest = uint64(block.timestamp) + MIN_DURATION;
        uint64 latest = uint64(block.timestamp) + MAX_DURATION;
        vm.expectRevert(abi.encodeWithSelector(SatStake.DeadlineTooSoon.selector, earliest));
        _create(staker, address(usdc), 1000, referee, beneficiary, earliest - 1, "Ship the demo");
        vm.expectRevert(abi.encodeWithSelector(SatStake.DeadlineTooFar.selector, latest));
        _create(staker, address(usdc), 1000, referee, beneficiary, latest + 1, "Ship the demo");
        _create(staker, address(usdc), 1000, referee, beneficiary, earliest, "Ship the demo");
        _create(staker, address(usdc), 1000, referee, beneficiary, latest, "Ship the demo");
    }

    /// @custom:verifies LLR-SC-026
    function test_SC026_revertsWhenThePromiseIsEmpty() public {
        vm.expectRevert(SatStake.PromiseEmpty.selector);
        _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), "");
        // One byte is enough.
        _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), "x");
    }

    /// @custom:verifies LLR-SC-026
    function test_SC026_acceptsAPromiseOfExactly280Bytes() public {
        string memory atLimit = _ascii(MAX_PROMISE_BYTES);
        assertEq(bytes(atLimit).length, 280);
        uint256 id = _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), atLimit);
        assertEq(_storedPledge(id).promiseText, atLimit);
    }

    /// @custom:verifies LLR-SC-026
    function test_SC026_revertsForAPromiseOf281Bytes() public {
        string memory tooLong = _ascii(MAX_PROMISE_BYTES + 1);
        assertEq(bytes(tooLong).length, 281);
        vm.expectRevert(abi.encodeWithSelector(SatStake.PromiseTooLong.selector, 281));
        _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), tooLong);
    }

    /// @custom:verifies LLR-SC-026
    function test_SC026_measuresThePromiseInBytesNotCharacters() public {
        // 140 two-byte characters are 280 bytes: at the limit by bytes, half of it by characters.
        string memory atLimit = _twoByteChars(140);
        assertEq(bytes(atLimit).length, 280);
        _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), atLimit);

        // 141 two-byte characters are 282 bytes: a character count would accept them.
        string memory tooLong = _twoByteChars(141);
        assertEq(bytes(tooLong).length, 282);
        vm.expectRevert(abi.encodeWithSelector(SatStake.PromiseTooLong.selector, 282));
        _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), tooLong);

        // 281 bytes made of 139 two-byte characters and 3 one-byte ones: 142 characters.
        string memory justOver = string.concat(_twoByteChars(139), "abc");
        assertEq(bytes(justOver).length, 281);
        vm.expectRevert(abi.encodeWithSelector(SatStake.PromiseTooLong.selector, 281));
        _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), justOver);
    }

    // ---------------------------------------------------------------------------------------
    // Order of the checks.
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-021 LLR-SC-022 LLR-SC-023 LLR-SC-024 LLR-SC-025 LLR-SC-026
    function test_SC021_checksRunInTheOrderOfTheRequirements() public {
        uint64 earliest = uint64(block.timestamp) + MIN_DURATION;
        uint64 latest = uint64(block.timestamp) + MAX_DURATION;
        string memory tooLong = _ascii(MAX_PROMISE_BYTES + 1);

        // Every argument below fails its own check, so each call names the earliest failing one.
        vm.expectRevert(abi.encodeWithSelector(SatStake.TokenNotAllowed.selector, address(unallowed)));
        _create(staker, address(unallowed), 0, address(0), address(0), 0, "");

        vm.expectRevert(SatStake.ZeroAmount.selector);
        _create(staker, address(usdc), 0, address(0), address(0), 0, "");

        vm.expectRevert(SatStake.ZeroAddress.selector);
        _create(staker, address(usdc), 1000, address(0), address(0), 0, "");

        vm.expectRevert(SatStake.PartyIsContract.selector);
        _create(staker, address(usdc), 1000, address(satStake), address(satStake), 0, "");

        vm.expectRevert(SatStake.PartyIsStaker.selector);
        _create(staker, address(usdc), 1000, staker, staker, 0, "");

        vm.expectRevert(SatStake.RefereeIsBeneficiary.selector);
        _create(staker, address(usdc), 1000, referee, referee, 0, "");

        vm.expectRevert(abi.encodeWithSelector(SatStake.DeadlineTooSoon.selector, earliest));
        _create(staker, address(usdc), 1000, referee, beneficiary, earliest - 1, "");

        vm.expectRevert(abi.encodeWithSelector(SatStake.DeadlineTooFar.selector, latest));
        _create(staker, address(usdc), 1000, referee, beneficiary, latest + 1, tooLong);

        vm.expectRevert(SatStake.PromiseEmpty.selector);
        _create(staker, address(usdc), 1000, referee, beneficiary, latest, "");

        vm.expectRevert(abi.encodeWithSelector(SatStake.PromiseTooLong.selector, 281));
        _create(staker, address(usdc), 1000, referee, beneficiary, latest, tooLong);
    }

    /// @custom:verifies LLR-SC-026 LLR-SC-027
    function test_SC026_everyCheckRunsBeforeTheTransfer() public {
        // `stranger` holds no token and has approved nothing, so a transfer attempted before the
        // checks would fail with the token's own error instead of the check's.
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(usdc.allowance(stranger, address(satStake)), 0);
        vm.expectRevert(SatStake.PromiseEmpty.selector);
        _create(stranger, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), "");

        // The last check of all, so a transfer placed anywhere before it is caught here and not
        // only by the empty-promise case above.
        vm.expectRevert(abi.encodeWithSelector(SatStake.PromiseTooLong.selector, MAX_PROMISE_BYTES + 1));
        _create(stranger, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), _ascii(MAX_PROMISE_BYTES + 1));
    }

    /// @custom:verifies LLR-SC-020 LLR-SC-021 LLR-SC-022 LLR-SC-023 LLR-SC-024 LLR-SC-025 LLR-SC-026
    function test_SC020_revertsUnlessEveryCheckPasses(
        uint256 tokenPick,
        uint256 amount,
        uint256 refereePick,
        uint256 beneficiaryPick,
        uint256 deadlinePick,
        uint256 promiseLength
    ) public {
        address[2] memory tokenPool = [address(usdc), address(unallowed)];
        address[5] memory partyPool = [address(0), address(satStake), staker, referee, beneficiary];
        // Offsets from now that sit on both duration boundaries and on either side of them.
        uint64[7] memory offsets = [
            uint64(0),
            MIN_DURATION - 1,
            MIN_DURATION,
            MIN_DURATION + 1,
            MAX_DURATION - 1,
            MAX_DURATION,
            MAX_DURATION + 1
        ];

        Args memory a;
        a.token = tokenPool[bound(tokenPick, 0, tokenPool.length - 1)];
        a.amount = bound(amount, 0, 2);
        a.referee = partyPool[bound(refereePick, 0, partyPool.length - 1)];
        a.beneficiary = partyPool[bound(beneficiaryPick, 0, partyPool.length - 1)];
        a.deadline = uint64(block.timestamp) + offsets[bound(deadlinePick, 0, offsets.length - 1)];
        a.promiseText = _ascii(bound(promiseLength, 0, MAX_PROMISE_BYTES + 2));

        bytes memory expected = _firstFailure(a);
        if (expected.length > 0) vm.expectRevert(expected);
        vm.prank(staker);
        uint256 id = satStake.createPledge(a.token, a.amount, a.referee, a.beneficiary, a.deadline, a.promiseText);
        if (expected.length == 0) assertEq(id, 1);
    }

    // The arguments of one call, in a struct because the fuzz test runs out of stack otherwise.
    struct Args {
        address token;
        uint256 amount;
        address referee;
        address beneficiary;
        uint64 deadline;
        string promiseText;
    }

    // The requirement order, restated: the error of the first check that fails, or empty for a
    // set of arguments that passes all of them.
    function _firstFailure(Args memory a) internal view returns (bytes memory) {
        uint64 earliest = uint64(block.timestamp) + MIN_DURATION;
        uint64 latest = uint64(block.timestamp) + MAX_DURATION;
        uint256 length = bytes(a.promiseText).length;
        if (!satStake.isAllowedToken(a.token)) {
            return abi.encodeWithSelector(SatStake.TokenNotAllowed.selector, a.token);
        }
        if (a.amount == 0) return abi.encodeWithSelector(SatStake.ZeroAmount.selector);
        if (a.referee == address(0) || a.beneficiary == address(0)) {
            return abi.encodeWithSelector(SatStake.ZeroAddress.selector);
        }
        if (a.referee == address(satStake) || a.beneficiary == address(satStake)) {
            return abi.encodeWithSelector(SatStake.PartyIsContract.selector);
        }
        if (a.referee == staker || a.beneficiary == staker) {
            return abi.encodeWithSelector(SatStake.PartyIsStaker.selector);
        }
        if (a.referee == a.beneficiary) return abi.encodeWithSelector(SatStake.RefereeIsBeneficiary.selector);
        if (a.deadline < earliest) return abi.encodeWithSelector(SatStake.DeadlineTooSoon.selector, earliest);
        if (a.deadline > latest) return abi.encodeWithSelector(SatStake.DeadlineTooFar.selector, latest);
        if (length == 0) return abi.encodeWithSelector(SatStake.PromiseEmpty.selector);
        if (length > MAX_PROMISE_BYTES) return abi.encodeWithSelector(SatStake.PromiseTooLong.selector, length);
        return "";
    }

    // ---------------------------------------------------------------------------------------
    // The transfer.
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-027
    function test_SC027_movesTheStakeFromTheStakerToTheContract() public {
        uint256 stakerBefore = usdc.balanceOf(staker);
        uint256 contractBefore = usdc.balanceOf(address(satStake));
        uint256 allowanceBefore = usdc.allowance(staker, address(satStake));

        _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");

        assertEq(usdc.balanceOf(staker), stakerBefore - 1000);
        assertEq(usdc.balanceOf(address(satStake)), contractBefore + 1000);
        // Spent from the staker's approval, not from anyone else's.
        assertEq(usdc.allowance(staker, address(satStake)), allowanceBefore - 1000);
    }

    /// @custom:verifies LLR-SC-027
    function test_SC027_revertsWhenLessThanTheAmountArrives() public {
        // A 1% fee on 1000 delivers 990.
        vm.expectRevert(abi.encodeWithSelector(SatStake.UnexpectedTransferAmount.selector, 1000, 990));
        _create(staker, address(feeToken), 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");
        // The fee is rounded up, so even one unit is short by one.
        vm.expectRevert(abi.encodeWithSelector(SatStake.UnexpectedTransferAmount.selector, 1, 0));
        _create(staker, address(feeToken), 1, referee, beneficiary, _defaultDeadline(), "Ship the demo");
    }

    /// @custom:verifies LLR-SC-027
    function test_SC027_measuresTheContractsOwnBalanceChange() public {
        // A balance the contract already holds is not counted as received.
        usdc.mint(address(satStake), 5000);
        uint256 id = _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");
        assertEq(_storedPledge(id).amount, 1000);
        assertEq(usdc.balanceOf(address(satStake)), 6000);
    }

    /// @custom:verifies LLR-SC-027
    function test_SC027_revertsWhenTheContractsBalanceFalls() public {
        // The contract holds the stake of an earlier pledge, which the token takes for itself
        // during the transfer, so the balance ends lower than it started.
        _create(staker, address(hostile), 1000, referee, beneficiary, _defaultDeadline(), "Earlier pledge");
        assertEq(hostile.balanceOf(address(satStake)), 1000);

        hostile.setDrain(address(satStake));
        vm.expectRevert(abi.encodeWithSelector(SatStake.UnexpectedTransferAmount.selector, 500, 0));
        _create(staker, address(hostile), 500, referee, beneficiary, _defaultDeadline(), "Drained pledge");

        // The earlier pledge's stake is untouched, because the whole call was undone.
        assertEq(hostile.balanceOf(address(satStake)), 1000);
    }

    /// @custom:verifies LLR-SC-003
    function test_SC003_revertsWhenTheTokenReportsFailure() public {
        hostile.setReturnMode(MockHostileToken.ReturnMode.False);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(hostile)));
        _create(staker, address(hostile), 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");
    }

    /// @custom:verifies LLR-SC-003
    function test_SC003_acceptsATokenThatReturnsNoValue() public {
        // Real USDC returns a value, but several deployed tokens return nothing; SafeERC20 treats
        // a non-reverting call to a contract as success.
        hostile.setReturnMode(MockHostileToken.ReturnMode.Nothing);
        uint256 id = _create(staker, address(hostile), 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");
        assertEq(id, 1);
        assertEq(hostile.balanceOf(address(satStake)), 1000);
    }

    /// @custom:verifies LLR-SC-003
    function test_SC003_revertsWhenTheTokenReentersCreatePledge() public {
        // The token is funded and approved, so the reentrant call has everything it needs and the
        // guard is the only thing that can stop it. Without that, the test would pass against an
        // unguarded contract for want of funds rather than for want of the guard.
        _fund(address(usdc), address(hostile));
        assertGe(usdc.balanceOf(address(hostile)), 500);
        assertGe(usdc.allowance(address(hostile), address(satStake)), 500);

        bytes memory reentrant = abi.encodeCall(
            SatStake.createPledge, (address(usdc), 500, referee, beneficiary, _defaultDeadline(), "Reentrant pledge")
        );
        hostile.setReentry(address(satStake), reentrant);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        _create(staker, address(hostile), 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");

        // Neither pledge exists, so the guard stopped the second one and undid the first.
        assertEq(_storedPledgeIds(referee).length, 0);
        assertEq(_storedTotalLocked(address(usdc)), 0);
        assertEq(_storedTotalLocked(address(hostile)), 0);
    }

    /// @custom:verifies LLR-SC-003
    function test_SC003_allowsANonReentrantCallFromTheToken() public {
        // The hostile token does reach back into the contract: a call that the guard does not
        // block goes through, which is what makes the blocked one above evidence of the guard.
        hostile.setReentry(address(satStake), abi.encodeCall(SatStake.isAllowedToken, (address(usdc))));
        uint256 id = _create(staker, address(hostile), 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");
        assertEq(id, 1);
        assertEq(hostile.reentryCount(), 1);
    }

    // ---------------------------------------------------------------------------------------
    // Bookkeeping and the event.
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-028
    function test_SC028_increasesTotalLockedForThatTokenOnly() public {
        assertEq(_storedTotalLocked(address(usdc)), 0);
        _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), "Ship the demo");
        assertEq(_storedTotalLocked(address(usdc)), 1000);
        assertEq(_storedTotalLocked(address(cirbtc)), 0);

        _create(staker, address(usdc), 250, referee, beneficiary, _defaultDeadline(), "Ship the demo");
        _create(staker, address(cirbtc), 7, referee, beneficiary, _defaultDeadline(), "Ship the demo");
        assertEq(_storedTotalLocked(address(usdc)), 1250);
        assertEq(_storedTotalLocked(address(cirbtc)), 7);
    }

    /// @custom:verifies LLR-SC-028
    function test_SC028_appendsTheIdentifierToEachPartysIndex() public {
        uint256 first = _create(staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline(), "One");
        uint256 second = _create(staker, address(usdc), 1000, beneficiary, referee, _defaultDeadline(), "Two");

        uint256[] memory expected = new uint256[](2);
        (expected[0], expected[1]) = (first, second);
        assertEq(_storedPledgeIds(staker), expected);
        assertEq(_storedPledgeIds(referee), expected);
        assertEq(_storedPledgeIds(beneficiary), expected);
        // Nobody else gains an entry.
        assertEq(_storedPledgeIds(outsider).length, 0);
        assertEq(_storedPledgeIds(address(satStake)).length, 0);
        assertEq(_storedPledgeIds(address(usdc)).length, 0);
    }

    /// @custom:verifies LLR-SC-028
    function test_SC028_indexKeepsCreationOrderPerAccount() public {
        uint256 first = _create(staker, address(usdc), 1, referee, beneficiary, _defaultDeadline(), "One");
        uint256 second = _create(outsider, address(usdc), 1, referee, beneficiary, _defaultDeadline(), "Two");
        uint256 third = _create(staker, address(usdc), 1, referee, beneficiary, _defaultDeadline(), "Three");

        uint256[] memory stakerIds = _storedPledgeIds(staker);
        assertEq(stakerIds.length, 2);
        assertEq(stakerIds[0], first);
        assertEq(stakerIds[1], third);

        uint256[] memory outsiderIds = _storedPledgeIds(outsider);
        assertEq(outsiderIds.length, 1);
        assertEq(outsiderIds[0], second);

        uint256[] memory refereeIds = _storedPledgeIds(referee);
        assertEq(refereeIds.length, 3);
        assertEq(refereeIds[0], first);
        assertEq(refereeIds[1], second);
        assertEq(refereeIds[2], third);
    }

    /// @custom:verifies LLR-SC-029
    function test_SC029_emitsPledgeCreatedWithTheNewPledgesFields() public {
        uint64 deadline = uint64(block.timestamp + 4242);

        vm.recordLogs();
        uint256 id = _create(staker, address(cirbtc), 31337, referee, beneficiary, deadline, "Ship the demo");
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // The token's own transfer event comes first; the pledge event is the contract's only one.
        uint256 found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(satStake)) continue;
            found++;
            assertEq(logs[i].topics.length, 4);
            assertEq(logs[i].topics[0], SatStake.PledgeCreated.selector);
            assertEq(uint256(logs[i].topics[1]), id);
            assertEq(logs[i].topics[2], bytes32(uint256(uint160(staker))));
            assertEq(logs[i].topics[3], bytes32(uint256(uint160(address(cirbtc)))));
            assertEq(logs[i].data, abi.encode(uint256(31337), referee, beneficiary, deadline));
        }
        assertEq(found, 1);
    }

    /// @custom:verifies LLR-SC-029
    function test_SC029_emitsOncePerPledgeWithItsOwnIdentifier() public {
        vm.expectEmit(true, true, true, true, address(satStake));
        emit SatStake.PledgeCreated(1, staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline());
        _createDefault();

        vm.expectEmit(true, true, true, true, address(satStake));
        emit SatStake.PledgeCreated(2, staker, address(usdc), 1000, referee, beneficiary, _defaultDeadline());
        _createDefault();
    }
}
