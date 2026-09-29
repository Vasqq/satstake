// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";

/// @notice The one way a test reads the compiled artifact of SatStake.
///
/// Reading the artifact is how the tests of what the contract does not declare get their evidence,
/// and an artifact from an older build is evidence about older source. `forge coverage` makes that
/// concrete: it compiles for itself and leaves the artifact of the previous `forge build` in `out/`,
/// so a run under coverage would otherwise read the ABI and the bytecode of whatever was built last
/// while exercising the contract in front of it. A fifth non-view function passed the LLR-SC-061 test
/// that way.
///
/// So every read goes through `json`, which first compares the source hash the artifact records with
/// the hash of the source on disk and fails naming the staleness if they differ.
library Artifact {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    string internal constant PATH = "out/SatStake.sol/SatStake.json";
    string internal constant SOURCE = "src/SatStake.sol";

    function json() internal view returns (string memory artifact) {
        artifact = VM.readFile(PATH);
        bytes32 recorded = VM.parseJsonBytes32(artifact, '.metadata.sources.["src/SatStake.sol"].keccak256');
        VM.assertEq(
            recorded,
            keccak256(bytes(VM.readFile(SOURCE))),
            "stale artifact: out/SatStake.sol/SatStake.json was built from different source than src/SatStake.sol"
        );
    }
}
