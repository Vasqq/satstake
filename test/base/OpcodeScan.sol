// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Walks compiled EVM bytecode one instruction at a time and reports whether an opcode is
/// ever executable.
///
/// A plain byte search over the same bytes answers a different question and answers it wrongly. Two
/// kinds of byte are not instructions: the immediate data of a PUSH, which the EVM never decodes,
/// and the CBOR metadata solc appends after the code, which the EVM never reaches. A search that
/// counts either one reports an opcode that cannot run, and a search that misses the alignment can
/// also walk past a real one. So the walk skips PUSH immediates and the metadata trailer is removed
/// first.
library OpcodeScan {
    /// @notice A PUSH at `offset` declares more immediate bytes than the input holds, so the input is
    /// not a complete instruction stream and no answer about it would mean anything.
    error TruncatedPushImmediate(uint256 offset);

    // Instruction boundaries: PUSH1 through PUSH32 carry 1 to 32 bytes of immediate data after the
    // opcode itself. PUSH0 (0x5f) carries none and is deliberately outside this range.
    uint8 internal constant PUSH1 = 0x60;
    uint8 internal constant PUSH32 = 0x7f;

    /// @notice Whether `opcode` appears as an instruction in `code`.
    function containsOpcode(bytes memory code, uint8 opcode) internal pure returns (bool) {
        return offsetOfOpcode(code, opcode) != type(uint256).max;
    }

    /// @notice The offset of the first instruction equal to `opcode`, or `type(uint256).max` if it
    /// never appears. The offset is returned so a failure can name where the instruction sits.
    function offsetOfOpcode(bytes memory code, uint8 opcode) internal pure returns (uint256) {
        bytes memory body = withoutMetadata(code);
        uint256 i = 0;
        while (i < body.length) {
            uint8 op = uint8(body[i]);
            if (op == opcode) return i;
            // The immediate follows the opcode, so a PUSH advances past both.
            uint256 next = i + ((op >= PUSH1 && op <= PUSH32) ? uint256(op) - PUSH1 + 2 : 1);
            // Compiled code never ends inside a PUSH immediate. Stopping quietly here would end the
            // walk early and report the tail beyond it clean without having looked at it.
            if (next > body.length) revert TruncatedPushImmediate(i);
            i = next;
        }
        return type(uint256).max;
    }

    /// @notice `code` with solc's metadata trailer removed.
    ///
    /// Compiler output ends with the CBOR-encoded metadata followed by two bytes holding its length,
    /// big-endian. Those bytes sit after every reachable instruction, and their content is a hash and
    /// a version string, so any byte value can occur in them. Input whose last two bytes describe a
    /// trailer longer than the input is returned whole, since no trailer can be identified there.
    ///
    /// The guarantee is no stronger than that. The two bytes are trusted to describe the trailer, so
    /// input that is not compiler output, or output whose length bytes are wrong but small enough to
    /// fit, has that many bytes removed from the end whether they are metadata or not.
    function withoutMetadata(bytes memory code) internal pure returns (bytes memory) {
        if (code.length < 2) return code;
        uint256 declared = (uint256(uint8(code[code.length - 2])) << 8) | uint256(uint8(code[code.length - 1]));
        uint256 trailer = declared + 2;
        if (trailer > code.length) return code;
        uint256 kept = code.length - trailer;
        bytes memory body = new bytes(kept);
        for (uint256 i = 0; i < kept; i++) {
            body[i] = code[i];
        }
        return body;
    }
}
