// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Artifact} from "./base/Artifact.sol";
import {NatSpecAudit} from "./base/NatSpecAudit.sol";

/// @notice Checks the annotations of the deployed contract from its compiled artifact, because a tag
/// added to `src/SatStake.sol` now would change the verified source and the metadata hash in the
/// deployed bytecode.
///
/// Reading of LLR-SC-080 for the two errors the contract does not declare. Section 1.1 of the
/// requirements says the OpenZeppelin units "raise two further errors, which the contract does not
/// declare but its ABI carries". The requirement speaks of what the contract carries NatSpec for, and
/// those two are declared in `SafeERC20` and `ReentrancyGuard`, where this repository cannot annotate
/// them without editing a pinned library. They are exempted by name, and the test fails if either is
/// absent from the ABI (so the exemption cannot outlive the requirement it rests on) or if any other
/// error lacks a tag.
contract SatStakeNatSpecTest is Test {
    /// A complete metadata document in the shape solc writes, one entry of each kind.
    string internal constant GOOD = '{"output":{"abi":['
        '{"type":"function","name":"f","inputs":[],"outputs":[],"stateMutability":"nonpayable"},'
        '{"type":"function","name":"K","inputs":[],"outputs":[],"stateMutability":"view"},'
        '{"type":"event","name":"E","inputs":[]},' '{"type":"error","name":"X","inputs":[]}],'
        '"devdoc":{"methods":{"f()":{"custom:trace":"LLR-SC-001 LLR-SC-002"}},'
        '"stateVariables":{"K":{"custom:trace":"LLR-SC-005"}},' '"events":{"E()":{"custom:trace":"LLR-SC-029"}},'
        '"errors":{"X()":[{"custom:trace":"LLR-SC-004"}]}},'
        '"userdoc":{"methods":{"f()":{"notice":"Does f."},"K()":{"notice":"A constant."}},'
        '"events":{"E()":{"notice":"E happened."}},' '"errors":{"X()":[{"notice":"X went wrong."}]}}}}';

    function _problems(string memory metadata) internal view returns (uint256) {
        return NatSpecAudit.audit(metadata).problems.length;
    }

    function _swap(string memory source, string memory from, string memory to) internal pure returns (string memory) {
        bytes memory s = bytes(source);
        bytes memory f = bytes(from);
        for (uint256 i = 0; i + f.length <= s.length; i++) {
            bool same = true;
            for (uint256 j = 0; j < f.length; j++) {
                if (s[i + j] != f[j]) {
                    same = false;
                    break;
                }
            }
            if (same) {
                return string.concat(string(_slice(s, 0, i)), to, string(_slice(s, i + f.length, s.length)));
            }
        }
        revert("fixture does not contain the text to replace");
    }

    function _slice(bytes memory b, uint256 from, uint256 to) private pure returns (bytes memory out) {
        out = new bytes(to - from);
        for (uint256 i = from; i < to; i++) {
            out[i - from] = b[i];
        }
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_theDeployedContractCarriesNatSpecAndATraceTagOnEveryFunctionEventAndError() public {
        string memory artifact = Artifact.json();
        NatSpecAudit.Result memory result = NatSpecAudit.audit(vm.parseJsonString(artifact, ".rawMetadata"));

        for (uint256 i = 0; i < result.problems.length; i++) {
            emit log(result.problems[i]);
        }
        assertEq(result.problems.length, 0, "an ABI entry lacks NatSpec or a trace tag");

        // 16 functions (12 reads, 4 non-view), 4 events, 20 errors minus the two exempt ones. Counting
        // them keeps an audit that looked at nothing from passing.
        assertEq(result.checked, 16 + 4 + 18, "the audit did not reach every entry of the ABI");
        assertEq(result.exempt, 2, "exactly the two inherited errors are exempt");
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_aCompleteFixturePasses() public view {
        NatSpecAudit.Result memory result = NatSpecAudit.audit(GOOD);
        assertEq(result.problems.length, 0);
        assertEq(result.checked, 4);
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_aFunctionWithoutATraceTagFails() public view {
        assertEq(
            _problems(_swap(GOOD, '"methods":{"f()":{"custom:trace":"LLR-SC-001 LLR-SC-002"}}', '"methods":{}')), 1
        );
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_aFunctionWithoutNoticeOrDevDocFails() public view {
        assertEq(_problems(_swap(GOOD, '"f()":{"notice":"Does f."},', "")), 1);
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_aDevDetailsStandsInForANotice() public view {
        string memory metadata = _swap(GOOD, '"f()":{"notice":"Does f."},', "");
        metadata = _swap(metadata, '"f()":{"custom:trace"', '"f()":{"details":"Does f.","custom:trace"');
        assertEq(_problems(metadata), 0);
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_aConstantTakesItsTraceFromTheStateVariableDoc() public view {
        assertEq(
            _problems(_swap(GOOD, '"stateVariables":{"K":{"custom:trace":"LLR-SC-005"}}', '"stateVariables":{}')), 1
        );
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_anEventWithoutATraceTagFails() public view {
        assertEq(_problems(_swap(GOOD, '"events":{"E()":{"custom:trace":"LLR-SC-029"}}', '"events":{}')), 1);
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_anEventWithoutANoticeFails() public view {
        assertEq(_problems(_swap(GOOD, '"events":{"E()":{"notice":"E happened."}}', '"events":{}')), 1);
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_anErrorWithoutATraceTagFails() public view {
        assertEq(_problems(_swap(GOOD, '"errors":{"X()":[{"custom:trace":"LLR-SC-004"}]}', '"errors":{}')), 1);
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_anErrorWithoutANoticeFails() public view {
        assertEq(_problems(_swap(GOOD, '"errors":{"X()":[{"notice":"X went wrong."}]}', '"errors":{}')), 1);
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_aTagWithoutAWellFormedIdFails() public view {
        assertEq(_problems(_swap(GOOD, "LLR-SC-005", "see the requirements")), 1);
        assertEq(_problems(_swap(GOOD, "LLR-SC-005", string.concat("LLR-SC", "-5"))), 1);
        assertEq(_problems(_swap(GOOD, "LLR-SC-005", "LLR-sc-005")), 1);
        assertEq(_problems(_swap(GOOD, "LLR-SC-005", "LLR-SC_005")), 1);
        assertEq(_problems(_swap(GOOD, "LLR-SC-005", string.concat("LLR-SC-005", "1"))), 1);
        assertEq(_problems(_swap(GOOD, "LLR-SC-005", "LLR-SC-005 LLR-SC-")), 1);
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_aTagMayListSeveralIdsEvenWhenALineBreakJoinedThemWithoutASpace() public view {
        assertEq(_problems(_swap(GOOD, "LLR-SC-005", "LLR-SC-005LLR-SC-006 LLR-DP-010")), 0);
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_everyEntryWithoutDocsIsReportedNotJustTheFirst() public view {
        string memory metadata = _swap(GOOD, '"events":{"E()":{"custom:trace":"LLR-SC-029"}}', '"events":{}');
        metadata = _swap(metadata, '"errors":{"X()":[{"custom:trace":"LLR-SC-004"}]}', '"errors":{}');
        assertEq(_problems(metadata), 2);
    }

    /// @custom:verifies LLR-SC-080
    function test_SC080_onlyTheTwoInheritedErrorsAreExempt() public view {
        string memory tail = '"name":"X","inputs":[]}],';
        string memory inherited =
            '"name":"X","inputs":[]},{"type":"error","name":"ReentrancyGuardReentrantCall","inputs":[]},'
            '{"type":"error","name":"SafeERC20FailedOperation","inputs":[]}],';
        NatSpecAudit.Result memory result = NatSpecAudit.audit(_swap(GOOD, tail, inherited));
        assertEq(result.problems.length, 0);
        assertEq(result.exempt, 2);

        string memory other = '"name":"X","inputs":[]},{"type":"error","name":"SomeOtherError","inputs":[]}],';
        assertEq(_problems(_swap(GOOD, tail, other)), 1);
    }
}
