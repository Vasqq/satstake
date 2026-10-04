// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";

/// @notice Reads the NatSpec the compiler recorded for a contract and lists what is missing.
///
/// The input is the metadata document solc embeds in the artifact (`rawMetadata`), because the
/// `devdoc` and `userdoc` copies Foundry lifts into the artifact drop the events, the errors, and the
/// state-variable docs. An ABI entry passes when it has a notice or dev doc and a trace tag
/// that names at least one LLR, with every `LLR-` it contains well formed.
library NatSpecAudit {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Result {
        uint256 checked;
        uint256 exempt;
        string[] problems;
    }

    /// Where the docs for one kind of entry live, and whether solc wraps each entry in an array
    /// (it does for errors, since an error may be documented once per declaration).
    struct Section {
        string dev;
        string user;
        bool wrapped;
    }

    function audit(string memory metadata) internal view returns (Result memory result) {
        uint256 abiLength;
        while (VM.keyExistsJson(metadata, string.concat(".output.abi[", VM.toString(abiLength), "]"))) {
            abiLength++;
        }
        result.problems = new string[](abiLength);
        uint256 found;

        for (uint256 i = 0; i < abiLength; i++) {
            string memory entry = string.concat(".output.abi[", VM.toString(i), "]");
            bytes32 kind = keccak256(bytes(VM.parseJsonString(metadata, string.concat(entry, ".type"))));
            string memory name = VM.keyExistsJson(metadata, string.concat(entry, ".name"))
                ? VM.parseJsonString(metadata, string.concat(entry, ".name"))
                : "";

            string memory problem;
            if (kind == keccak256("function")) {
                result.checked++;
                problem = _checkFunction(metadata, name);
            } else if (kind == keccak256("event")) {
                result.checked++;
                problem =
                    _check(metadata, "event", name, Section(".output.devdoc.events", ".output.userdoc.events", false));
            } else if (kind == keccak256("error")) {
                if (_isInherited(name)) {
                    result.exempt++;
                    continue;
                }
                result.checked++;
                problem =
                    _check(metadata, "error", name, Section(".output.devdoc.errors", ".output.userdoc.errors", true));
            } else {
                continue;
            }
            if (bytes(problem).length > 0) result.problems[found++] = problem;
        }

        string[] memory trimmed = result.problems;
        assembly {
            mstore(trimmed, found)
        }
    }

    /// The two errors section 1.1 of the requirements attributes to the OpenZeppelin units and says the
    /// contract does not declare.
    function _isInherited(string memory name) private pure returns (bool) {
        bytes32 h = keccak256(bytes(name));
        return h == keccak256("ReentrancyGuardReentrantCall") || h == keccak256("SafeERC20FailedOperation");
    }

    function _checkFunction(string memory metadata, string memory name) private view returns (string memory) {
        string memory devKey = _keyFor(metadata, ".output.devdoc.methods", name);
        string memory userKey = _keyFor(metadata, ".output.userdoc.methods", name);
        string memory dev = string.concat(".output.devdoc.methods.", _quote(devKey));
        string memory constant_ = string.concat(".output.devdoc.stateVariables.", _quote(name));

        // A public constant is documented as a state variable rather than as a method, and only its
        // getter appears in the ABI.
        string memory trace = _text(metadata, dev, "custom:trace");
        if (bytes(trace).length == 0) trace = _text(metadata, constant_, "custom:trace");

        bool documented = bytes(_text(metadata, string.concat(".output.userdoc.methods.", _quote(userKey)), "notice"))
            .length > 0 || bytes(_text(metadata, dev, "details")).length > 0
            || bytes(_text(metadata, constant_, "details")).length > 0;

        return _verdict("function", name, documented, trace);
    }

    function _check(string memory metadata, string memory kind, string memory name, Section memory section)
        private
        view
        returns (string memory)
    {
        string memory dev = string.concat(section.dev, ".", _quote(_keyFor(metadata, section.dev, name)));
        string memory user = string.concat(section.user, ".", _quote(_keyFor(metadata, section.user, name)));
        if (section.wrapped) {
            dev = string.concat(dev, "[0]");
            user = string.concat(user, "[0]");
        }
        bool documented =
            bytes(_text(metadata, user, "notice")).length > 0 || bytes(_text(metadata, dev, "details")).length > 0;
        return _verdict(kind, name, documented, _text(metadata, dev, "custom:trace"));
    }

    function _verdict(string memory kind, string memory name, bool documented, string memory trace)
        private
        pure
        returns (string memory)
    {
        if (!documented) return string.concat(kind, " ", name, " has no NatSpec notice or dev doc");
        (uint256 good, uint256 bad) = _countIds(trace);
        if (good == 0) return string.concat(kind, " ", name, " has no trace tag naming an LLR");
        if (bad > 0) return string.concat(kind, " ", name, " has a malformed LLR ID in its trace tag");
        return "";
    }

    /// Counts the `LLR-XX-nnn` IDs in a tag, and the `LLR-` prefixes that do not begin one. A fourth
    /// digit counts as malformed, so a mistyped ID is not read as a shorter, valid one.
    function _countIds(string memory tag) private pure returns (uint256 good, uint256 bad) {
        bytes memory b = bytes(tag);
        for (uint256 i = 0; i + 3 < b.length; i++) {
            if (b[i] != "L" || b[i + 1] != "L" || b[i + 2] != "R" || b[i + 3] != "-") continue;
            bool ok = i + 9 < b.length && _upper(b[i + 4]) && _upper(b[i + 5]) && b[i + 6] == "-" && _digit(b[i + 7])
                && _digit(b[i + 8]) && _digit(b[i + 9]) && (i + 10 == b.length || !_digit(b[i + 10]));
            if (ok) good++;
            else bad++;
        }
    }

    function _upper(bytes1 c) private pure returns (bool) {
        return c >= "A" && c <= "Z";
    }

    function _digit(bytes1 c) private pure returns (bool) {
        return c >= "0" && c <= "9";
    }

    /// The key under `root` for the entry called `name`: the first that begins `name(`, or `name`
    /// itself for a state variable. Empty when there is none.
    function _keyFor(string memory metadata, string memory root, string memory name)
        private
        view
        returns (string memory)
    {
        if (!VM.keyExistsJson(metadata, root)) return "";
        string[] memory keys = VM.parseJsonKeys(metadata, root);
        bytes memory prefix = bytes(string.concat(name, "("));
        for (uint256 i = 0; i < keys.length; i++) {
            bytes memory key = bytes(keys[i]);
            if (key.length < prefix.length) continue;
            bool same = true;
            for (uint256 j = 0; j < prefix.length; j++) {
                if (key[j] != prefix[j]) {
                    same = false;
                    break;
                }
            }
            if (same) return keys[i];
        }
        return "";
    }

    function _quote(string memory key) private pure returns (string memory) {
        return string.concat('["', key, '"]');
    }

    function _text(string memory metadata, string memory base, string memory field)
        private
        view
        returns (string memory)
    {
        string memory path = string.concat(base, '.["', field, '"]');
        return VM.keyExistsJson(metadata, path) ? VM.parseJsonString(metadata, path) : "";
    }
}
