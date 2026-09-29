// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SatStake} from "../src/SatStake.sol";
import {SatStakeTestBase} from "./base/SatStakeTestBase.sol";
import {Artifact} from "./base/Artifact.sol";
import {OpcodeScan} from "./base/OpcodeScan.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";

/// @notice Three things the compiled contract must show: no way to send it value, exactly four
/// functions that are not `view`, and no instruction that could hand its code or its balance to
/// someone else. Read from the compiled artifact and the deployed bytecode rather than from the
/// source, because a reader of the source cannot see what the compiler emitted.
///
/// What is not checked here: the size of the read surface. LLR-SC-061 counts the functions that are
/// not `view`, so a thirteenth read function would pass, and no requirement forbids one.
contract SatStakeAbiSurfaceTest is SatStakeTestBase {
    /// One entry of the compiled ABI. `name` and `mutability` are empty when the entry has no such
    /// key, which is the case for a `receive` or `fallback` entry and for events and errors.
    struct AbiEntry {
        string kind;
        string name;
        string mutability;
    }

    uint8 internal constant DELEGATECALL = 0xf4;
    uint8 internal constant SELFDESTRUCT = 0xff;
    uint8 internal constant CALLCODE = 0xf2;

    MockFiatToken internal usdc;

    function setUp() public {
        vm.warp(1_700_000_000);
        usdc = new MockFiatToken(6);
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc);
        satStake = new SatStake(tokens);
        _fund(address(usdc), staker);
    }

    // ---------------------------------------------------------------------------------------
    // Reading the compiled artifact.
    // ---------------------------------------------------------------------------------------

    function _abiEntries() internal view returns (AbiEntry[] memory entries) {
        string memory json = Artifact.json();
        uint256 count;
        while (vm.keyExistsJson(json, string.concat(".abi[", vm.toString(count), "]"))) {
            count++;
        }
        assertGt(count, 0, "the artifact has no ABI");

        entries = new AbiEntry[](count);
        for (uint256 i = 0; i < count; i++) {
            string memory path = string.concat(".abi[", vm.toString(i), "]");
            entries[i].kind = vm.parseJsonString(json, string.concat(path, ".type"));
            entries[i].name = _optionalString(json, string.concat(path, ".name"));
            entries[i].mutability = _optionalString(json, string.concat(path, ".stateMutability"));
        }
    }

    function _optionalString(string memory json, string memory path) internal view returns (string memory) {
        if (!vm.keyExistsJson(json, path)) return "";
        return vm.parseJsonString(json, path);
    }

    function _artifactBytes(string memory path) internal view returns (bytes memory) {
        return vm.parseBytes(vm.parseJsonString(Artifact.json(), path));
    }

    // ---------------------------------------------------------------------------------------
    // No value in (LLR-SC-002).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-002
    function test_SC002_theCompiledAbiDeclaresNothingPayableAndNoReceiveOrFallback() public view {
        AbiEntry[] memory entries = _abiEntries();
        for (uint256 i = 0; i < entries.length; i++) {
            // Covers the constructor as well as the functions, since it carries the same key.
            assertFalse(_eq(entries[i].mutability, "payable"), entries[i].name);
            assertFalse(_eq(entries[i].kind, "receive"), "the ABI declares a receive function");
            assertFalse(_eq(entries[i].kind, "fallback"), "the ABI declares a fallback function");
        }
    }

    /// @custom:verifies LLR-SC-002
    function test_SC002_aCallCarryingValueRevertsAndMovesNoFunds() public {
        vm.deal(address(this), 3 ether);
        uint256 senderBefore = address(this).balance;

        // Empty calldata, which a receive function would answer.
        (bool emptyOk,) = address(satStake).call{value: 1 ether}("");
        // A selector the contract does not have, which a fallback function would answer.
        (bool unknownOk,) = address(satStake).call{value: 1 ether}(hex"deadbeef");
        // An existing function, which would answer if it were payable.
        (bool viewOk,) = address(satStake).call{value: 1 ether}(abi.encodeCall(SatStake.pledgeCount, ()));
        // The one function a staker calls with an amount; the amount is in the token, never in value.
        (bool createOk,) = address(satStake).call{value: 1 ether}(
            abi.encodeCall(
                SatStake.createPledge,
                (address(usdc), 1000, referee, beneficiary, uint64(block.timestamp + 1 days), "Ship the demo")
            )
        );

        assertFalse(emptyOk, "empty calldata with value was accepted");
        assertFalse(unknownOk, "an unknown selector with value was accepted");
        assertFalse(viewOk, "a read function with value was accepted");
        assertFalse(createOk, "createPledge with value was accepted");

        assertEq(address(satStake).balance, 0);
        assertEq(address(this).balance, senderBefore);
        // The refused creation left no pledge behind either.
        assertEq(satStake.pledgeCount(), 0);
    }

    /// @custom:verifies LLR-SC-002
    function test_SC002_aCallWithNoMatchingFunctionRevertsWithNoValueToo() public {
        // Without a receive or a fallback there is nothing to answer these, whether they carry value
        // or not, so the refusal above is not only about the value.
        (bool emptyOk,) = address(satStake).call("");
        (bool unknownOk,) = address(satStake).call(hex"deadbeef");
        assertFalse(emptyOk, "empty calldata was accepted");
        assertFalse(unknownOk, "an unknown selector was accepted");
    }

    // ---------------------------------------------------------------------------------------
    // Exactly four ways to change state (LLR-SC-061).
    // ---------------------------------------------------------------------------------------

    /// @custom:verifies LLR-SC-061
    function test_SC061_theCompiledAbiHasExactlyTheFourNonViewFunctions() public view {
        string[4] memory expected = ["createPledge", "markKept", "markBroken", "settle"];
        bool[4] memory found;

        AbiEntry[] memory entries = _abiEntries();
        uint256 nonView;
        for (uint256 i = 0; i < entries.length; i++) {
            if (!_eq(entries[i].kind, "function")) continue;
            // `pure` is not exempt. The requirement counts the functions that are not `view`, and a
            // `pure` function is not a `view` function; the test below confirms from the artifact
            // that the read surface, the four constant getters included, is `view` and not `pure`.
            if (_eq(entries[i].mutability, "view")) continue;
            nonView++;

            // Fails on any name that is not one of the four, so an added function is caught.
            bool matched;
            for (uint256 j = 0; j < expected.length; j++) {
                if (!_eq(entries[i].name, expected[j])) continue;
                assertFalse(found[j], string.concat("two ABI entries named ", expected[j]));
                found[j] = true;
                matched = true;
            }
            assertTrue(matched, string.concat("unexpected non-view function: ", entries[i].name));
        }

        // Fails on a missing name, so a removed function is caught too.
        for (uint256 j = 0; j < expected.length; j++) {
            assertTrue(found[j], string.concat("missing non-view function: ", expected[j]));
        }
        assertEq(nonView, 4);
    }

    /// The four constants and the eight read functions are `view`, which is why the count above is
    /// four and not sixteen. A constant turned into a state variable with a setter, or a read that
    /// started writing, would move into that count.
    /// @custom:verifies LLR-SC-061
    function test_SC061_everyReadFunctionAndConstantIsView() public view {
        string[12] memory reads = [
            "MIN_DURATION",
            "MAX_DURATION",
            "MAX_PROMISE_BYTES",
            "MAX_PAGE",
            "getPledge",
            "stateOf",
            "pledgeCount",
            "pledgeCountOf",
            "pledgeIdsOf",
            "isAllowedToken",
            "allowedTokens",
            "totalLocked"
        ];

        AbiEntry[] memory entries = _abiEntries();
        for (uint256 j = 0; j < reads.length; j++) {
            bool seen;
            for (uint256 i = 0; i < entries.length; i++) {
                if (!_eq(entries[i].kind, "function")) continue;
                if (!_eq(entries[i].name, reads[j])) continue;
                seen = true;
                assertEq(entries[i].mutability, "view", reads[j]);
            }
            assertTrue(seen, string.concat("missing read function: ", reads[j]));
        }
    }

    // ---------------------------------------------------------------------------------------
    // Absence of power in the compiled code (LLR-SC-060).
    // ---------------------------------------------------------------------------------------

    /// Calls the walk across a call boundary, so that a revert inside it can be observed.
    function scan(bytes memory code, uint8 opcode) external pure returns (bool) {
        return OpcodeScan.containsOpcode(code, opcode);
    }

    /// The instruction walk itself, against byte strings built so that a byte search and an
    /// instruction walk disagree. A helper that reported the wrong answer would make the two tests
    /// below meaningless, so it is checked before it is used.
    /// @custom:verifies LLR-SC-060
    function test_SC060_theInstructionWalkSkipsPushDataAndTheMetadataTrailer() public {
        uint8[3] memory opcodes = [DELEGATECALL, SELFDESTRUCT, CALLCODE];

        for (uint256 i = 0; i < opcodes.length; i++) {
            uint8 op = opcodes[i];

            // Thirty-two copies inside the immediate of a PUSH32, which the EVM never decodes,
            // and a trailer declaring zero bytes of metadata.
            bytes memory inPushData = abi.encodePacked(hex"7f", _repeat(op, 32), hex"0000");
            assertFalse(OpcodeScan.containsOpcode(inPushData, op), "reported an opcode inside PUSH data");

            // The same byte as a real instruction, after a PUSH1 and its immediate.
            bytes memory real = abi.encodePacked(hex"6001", op, hex"0000");
            assertTrue(OpcodeScan.containsOpcode(real, op), "missed a real opcode");
            assertEq(OpcodeScan.offsetOfOpcode(real, op), 2);

            // Only inside the metadata trailer: three bytes of CBOR, one of them the opcode, and a
            // length of three. Everything before it is a harmless PUSH1.
            bytes memory inMetadata = abi.encodePacked(hex"6001", hex"a1", op, hex"01", hex"0003");
            assertFalse(OpcodeScan.containsOpcode(inMetadata, op), "reported an opcode inside the metadata");

            // A trailer length that does not fit is not compiler output, so nothing is stripped and
            // the opcode is still reported.
            bytes memory noTrailer = abi.encodePacked(hex"6001", op, hex"ffff");
            assertTrue(OpcodeScan.containsOpcode(noTrailer, op), "stripped more than the input holds");

            // A PUSH32 with one byte of immediate. Compiled code never ends inside an immediate, so
            // the walk refuses the input instead of stopping short and calling the tail clean.
            bytes memory truncated = abi.encodePacked(hex"7f", op, hex"0000");
            vm.expectRevert(abi.encodeWithSelector(OpcodeScan.TruncatedPushImmediate.selector, 0));
            this.scan(truncated, op);
        }
    }

    /// @custom:verifies LLR-SC-060
    function test_SC060_theDeployedBytecodeHasNoDelegatecallSelfdestructOrCallcode() public view {
        // The code as the chain holds it, so this is what would run, not what an artifact claims.
        bytes memory code = address(satStake).code;
        assertGt(code.length, 0);
        _assertNoPowerOpcodes(code, "deployed");
    }

    /// @custom:verifies LLR-SC-060
    function test_SC060_theCreationBytecodeHasNoDelegatecallSelfdestructOrCallcode() public view {
        // The constructor runs once and is not part of the deployed code, so it is walked separately,
        // and only the artifact holds it. The artifact's copy of the deployed code is walked here too,
        // not compared with the chain's: `forge coverage` leaves the artifact from the ordinary build
        // in place while running an uninstrumented rebuild, so the two are different compilations of
        // the same source, and each has to be clean in its own right.
        _assertNoPowerOpcodes(_artifactBytes(".bytecode.object"), "creation");
        _assertNoPowerOpcodes(_artifactBytes(".deployedBytecode.object"), "artifact deployed");
    }

    function _assertNoPowerOpcodes(bytes memory code, string memory which) internal pure {
        assertEq(
            OpcodeScan.offsetOfOpcode(code, DELEGATECALL), type(uint256).max, string.concat(which, ": delegatecall")
        );
        assertEq(
            OpcodeScan.offsetOfOpcode(code, SELFDESTRUCT), type(uint256).max, string.concat(which, ": selfdestruct")
        );
        assertEq(OpcodeScan.offsetOfOpcode(code, CALLCODE), type(uint256).max, string.concat(which, ": callcode"));
    }

    /// The requirement names `createPledge` and `settle` as the only functions that transfer tokens.
    /// A verdict is the other way state changes, and it must move nothing.
    /// @custom:verifies LLR-SC-060
    function test_SC060_aVerdictTransfersNoTokens() public {
        vm.prank(staker);
        uint256 kept =
            satStake.createPledge(address(usdc), 1000, referee, beneficiary, uint64(block.timestamp + 1 days), "One");
        vm.prank(staker);
        uint256 broken =
            satStake.createPledge(address(usdc), 2000, referee, beneficiary, uint64(block.timestamp + 1 days), "Two");

        address[5] memory accounts = [address(satStake), staker, referee, beneficiary, outsider];
        uint256[5] memory before;
        for (uint256 i = 0; i < accounts.length; i++) {
            before[i] = usdc.balanceOf(accounts[i]);
        }

        vm.prank(referee);
        satStake.markKept(kept);
        vm.prank(referee);
        satStake.markBroken(broken);

        for (uint256 i = 0; i < accounts.length; i++) {
            assertEq(usdc.balanceOf(accounts[i]), before[i]);
        }
        assertEq(satStake.totalLocked(address(usdc)), 3000);
    }

    function _repeat(uint8 byteValue, uint256 count) internal pure returns (bytes memory out) {
        out = new bytes(count);
        for (uint256 i = 0; i < count; i++) {
            out[i] = bytes1(byteValue);
        }
    }
}
