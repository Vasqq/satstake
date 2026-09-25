// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SatStake} from "../src/SatStake.sol";

/// @notice Declarations of the normative interface in 05_LLR.md section 1.1: constants, the
/// `Pledge` record, the `Status` and `PledgeState` enums, and the custom errors.
contract SatStakeBuildTest is Test {
    // Written by the build that `forge test` runs first; `ast = true` in foundry.toml adds the AST.
    string internal constant ARTIFACT = "out/SatStake.sol/SatStake.json";

    SatStake internal satStake;

    function setUp() public {
        // The constructor does not validate its allowlist in this group, so any array deploys.
        satStake = new SatStake(new address[](0));
    }

    /// Decodes externally so that a decoder revert can be observed with `vm.expectRevert`.
    function decodePledge(bytes calldata data) external pure returns (SatStake.Pledge memory) {
        return abi.decode(data, (SatStake.Pledge));
    }

    // ABI encoding of a Pledge whose head words are given raw, so that a test can place a value
    // outside a field's type range and check that the decoder rejects it.
    function _encodeRaw(uint256[8] memory head, string memory promiseText) internal pure returns (bytes memory) {
        return abi.encodePacked(
            uint256(0x20),
            abi.encode(head[0], head[1], head[2], head[3], head[4], head[5], head[6], head[7], promiseText)
        );
    }

    function _validHead() internal pure returns (uint256[8] memory head) {
        head = [uint256(1), 2, 3, 4, 5, 6, 7, 1];
    }

    function _assertConstant(string memory json, string memory name, string memory typeString) internal view {
        string memory decl = _stateVariablePath(json, name);
        assertEq(vm.parseJsonString(json, string.concat(decl, ".mutability")), "constant", name);
        assertEq(vm.parseJsonString(json, string.concat(decl, ".typeDescriptions.typeString")), typeString, name);
    }

    // JSON path of the declaration of state variable `name` in contract SatStake's AST. Walks by
    // index because each node's position in the AST depends on declaration order.
    function _stateVariablePath(string memory json, string memory name) internal view returns (string memory) {
        for (uint256 i = 0;; i++) {
            string memory c = string.concat(".ast.nodes[", vm.toString(i), "]");
            if (!vm.keyExistsJson(json, c)) break;
            if (!_eq(vm.parseJsonString(json, string.concat(c, ".nodeType")), "ContractDefinition")) continue;
            if (!_eq(vm.parseJsonString(json, string.concat(c, ".name")), "SatStake")) continue;
            for (uint256 j = 0;; j++) {
                string memory n = string.concat(c, ".nodes[", vm.toString(j), "]");
                if (!vm.keyExistsJson(json, n)) break;
                if (!_eq(vm.parseJsonString(json, string.concat(n, ".nodeType")), "VariableDeclaration")) continue;
                if (_eq(vm.parseJsonString(json, string.concat(n, ".name")), name)) return n;
            }
        }
        revert(string.concat("state variable not found: ", name));
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    /// @custom:verifies LLR-SC-005
    function test_SC005_constantsHaveExactValues() public view {
        assertEq(satStake.MIN_DURATION(), 60);
        assertEq(satStake.MAX_DURATION(), 365 days);
        assertEq(satStake.MAX_DURATION(), 31_536_000);
        assertEq(satStake.MAX_PROMISE_BYTES(), 280);
        assertEq(satStake.MAX_PAGE(), 100);
    }

    /// @custom:verifies LLR-SC-005
    function test_SC005_gettersReturnInterfaceTypes() public view {
        // Packed encoding keeps an integer's own width, so a uint64 and a uint256 of equal
        // value differ in length where the standard ABI encoding would not.
        assertEq(abi.encodePacked(satStake.MIN_DURATION()).length, 8);
        assertEq(abi.encodePacked(satStake.MAX_DURATION()).length, 8);
        assertEq(abi.encodePacked(satStake.MAX_PROMISE_BYTES()).length, 32);
        assertEq(abi.encodePacked(satStake.MAX_PAGE()).length, 32);
    }

    /// @custom:verifies LLR-SC-005
    function test_SC005_declaredConstantNotStorageOrImmutable() public view {
        // A storage variable or an immutable has the same getter as a constant, so only the
        // compiler's AST can tell them apart.
        string memory json = vm.readFile(ARTIFACT);
        _assertConstant(json, "MIN_DURATION", "uint64");
        _assertConstant(json, "MAX_DURATION", "uint64");
        _assertConstant(json, "MAX_PROMISE_BYTES", "uint256");
        _assertConstant(json, "MAX_PAGE", "uint256");
    }

    /// @custom:verifies LLR-SC-010
    function test_SC010_pledgeFieldsEncodeInInterfaceOrder() public pure {
        // Distinct values in every field, so any reordering changes the encoding.
        address staker = address(0x1001);
        address token = address(0x2002);
        uint256 amount = type(uint256).max - 7;
        address referee = address(0x3003);
        address beneficiary = address(0x4004);
        uint64 deadline = type(uint64).max - 1;
        uint64 createdAt = 1_700_000_000;
        SatStake.Status status = SatStake.Status.Broken;
        string memory promiseText = unicode"Run 5 km every day é✓";

        // Named fields: a missing, extra, or renamed field fails to compile, and each value
        // has the exact type from section 1.1, so a narrower field type also fails to compile.
        SatStake.Pledge memory p = SatStake.Pledge({
            staker: staker,
            token: token,
            amount: amount,
            referee: referee,
            beneficiary: beneficiary,
            deadline: deadline,
            createdAt: createdAt,
            status: status,
            promiseText: promiseText
        });

        bytes memory expected = abi.encodePacked(
            uint256(0x20),
            abi.encode(staker, token, amount, referee, beneficiary, deadline, createdAt, uint8(status), promiseText)
        );
        assertEq(abi.encode(p), expected);
    }

    /// @custom:verifies LLR-SC-010
    function test_SC010_pledgeDecodesFullRangeOfEachField() public view {
        uint256[8] memory head = [
            uint256(type(uint160).max),
            type(uint160).max - 1,
            type(uint256).max,
            type(uint160).max - 2,
            type(uint160).max - 3,
            type(uint64).max,
            type(uint64).max - 1,
            uint256(type(SatStake.Status).max)
        ];
        SatStake.Pledge memory p = this.decodePledge(_encodeRaw(head, "x"));
        assertEq(p.staker, address(type(uint160).max));
        assertEq(p.token, address(type(uint160).max - 1));
        assertEq(p.amount, type(uint256).max);
        assertEq(p.referee, address(type(uint160).max - 2));
        assertEq(p.beneficiary, address(type(uint160).max - 3));
        assertEq(p.deadline, type(uint64).max);
        assertEq(p.createdAt, type(uint64).max - 1);
        assertEq(uint8(p.status), uint8(SatStake.Status.SettledToBeneficiary));
        assertEq(p.promiseText, "x");
    }

    /// @custom:verifies LLR-SC-010
    function test_SC010_pledgeFieldTypesRejectWiderValues() public {
        // One value just past each field's type range, per head position. A field declared
        // wider than section 1.1 would accept it and the expected revert would not happen.
        uint256[8] memory tooWide = [
            uint256(1) << 160,
            uint256(1) << 160,
            0, // amount is uint256; no wider value exists
            uint256(1) << 160,
            uint256(1) << 160,
            uint256(1) << 64,
            uint256(1) << 64,
            uint256(type(SatStake.Status).max) + 1
        ];
        for (uint256 i = 0; i < 8; i++) {
            if (i == 2) continue;
            uint256[8] memory head = _validHead();
            head[i] = tooWide[i];
            vm.expectRevert();
            this.decodePledge(_encodeRaw(head, "x"));
        }
    }

    /// @custom:verifies LLR-SC-010
    function test_SC010_promiseTextIsString() public view {
        string memory promiseText = unicode"Read 12 books this year ü☃";
        SatStake.Pledge memory p = this.decodePledge(_encodeRaw(_validHead(), promiseText));
        assertEq(p.promiseText, promiseText);
    }

    /// @custom:verifies LLR-SC-011
    function test_SC011_statusMembersInInterfaceOrder() public pure {
        assertEq(uint8(SatStake.Status.None), 0);
        assertEq(uint8(SatStake.Status.Active), 1);
        assertEq(uint8(SatStake.Status.Kept), 2);
        assertEq(uint8(SatStake.Status.Broken), 3);
        assertEq(uint8(SatStake.Status.SettledToStaker), 4);
        assertEq(uint8(SatStake.Status.SettledToBeneficiary), 5);
        assertEq(uint8(type(SatStake.Status).max), 5);
    }

    /// @custom:verifies LLR-SC-011
    function test_SC011_noneIsTheZeroValue() public pure {
        // Storage never written reads as zero, so a nonexistent pledge has status None.
        SatStake.Pledge memory unset;
        assertEq(uint8(unset.status), uint8(SatStake.Status.None));
        assertEq(uint8(type(SatStake.Status).min), uint8(SatStake.Status.None));
    }

    /// @custom:verifies LLR-SC-011
    function test_SC011_pledgeStateMembersInInterfaceOrder() public pure {
        assertEq(uint8(SatStake.PledgeState.Active), 0);
        assertEq(uint8(SatStake.PledgeState.Expired), 1);
        assertEq(uint8(SatStake.PledgeState.Kept), 2);
        assertEq(uint8(SatStake.PledgeState.Broken), 3);
        assertEq(uint8(SatStake.PledgeState.SettledToStaker), 4);
        assertEq(uint8(SatStake.PledgeState.SettledToBeneficiary), 5);
        assertEq(uint8(type(SatStake.PledgeState).max), 5);
    }

    /// @custom:verifies LLR-SC-004
    function test_SC004_errorSelectorsMatchInterface() public pure {
        assertEq(SatStake.InvalidAllowlist.selector, bytes4(keccak256("InvalidAllowlist()")));
        assertEq(SatStake.TokenNotAllowed.selector, bytes4(keccak256("TokenNotAllowed(address)")));
        assertEq(SatStake.ZeroAmount.selector, bytes4(keccak256("ZeroAmount()")));
        assertEq(SatStake.ZeroAddress.selector, bytes4(keccak256("ZeroAddress()")));
        assertEq(SatStake.PartyIsContract.selector, bytes4(keccak256("PartyIsContract()")));
        assertEq(SatStake.PartyIsStaker.selector, bytes4(keccak256("PartyIsStaker()")));
        assertEq(SatStake.RefereeIsBeneficiary.selector, bytes4(keccak256("RefereeIsBeneficiary()")));
        assertEq(SatStake.DeadlineTooSoon.selector, bytes4(keccak256("DeadlineTooSoon(uint64)")));
        assertEq(SatStake.DeadlineTooFar.selector, bytes4(keccak256("DeadlineTooFar(uint64)")));
        assertEq(SatStake.PromiseEmpty.selector, bytes4(keccak256("PromiseEmpty()")));
        assertEq(SatStake.PromiseTooLong.selector, bytes4(keccak256("PromiseTooLong(uint256)")));
        assertEq(
            SatStake.UnexpectedTransferAmount.selector, bytes4(keccak256("UnexpectedTransferAmount(uint256,uint256)"))
        );
        assertEq(SatStake.PledgeNotFound.selector, bytes4(keccak256("PledgeNotFound(uint256)")));
        assertEq(SatStake.NotReferee.selector, bytes4(keccak256("NotReferee()")));
        // An enum parameter is encoded as uint8 in the selector.
        assertEq(SatStake.NotActive.selector, bytes4(keccak256("NotActive(uint8)")));
        assertEq(SatStake.VerdictWindowClosed.selector, bytes4(keccak256("VerdictWindowClosed(uint64)")));
        assertEq(SatStake.NotSettleable.selector, bytes4(keccak256("NotSettleable(uint64)")));
        assertEq(SatStake.AlreadySettled.selector, bytes4(keccak256("AlreadySettled()")));
    }
}
