// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SatStake} from "../../src/SatStake.sol";

/// @notice The part of every mock token that a test needs to put a funded, approved account in
/// front of the contract.
interface IMintableToken {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 value) external returns (bool);
}

/// @notice Shared ground for the contract tests: the parties, funding, and a reader for SatStake's
/// private bookkeeping storage.
///
/// The views that report that bookkeeping (`totalLocked`, `pledgeCountOf`, `pledgeIdsOf`,
/// `getPledge`, `stateOf`) belong to the "SC views" group, so until they exist the tests read the
/// slots directly. Each variable's own slot is taken from the compiler's storage layout by name;
/// the offsets inside a record follow the standard layout rules for the declarations in 05 section
/// 1.1. Keeping that knowledge in one place means one file to correct if the layout ever moves.
///
/// A derived test assigns `satStake` in its own `setUp`.
abstract contract SatStakeTestBase is Test {
    // Written by the build that `forge test` runs first; `extra_output` in foundry.toml adds the
    // storage layout.
    string internal constant ARTIFACT = "out/SatStake.sol/SatStake.json";

    SatStake internal satStake;

    address internal staker = makeAddr("staker");
    address internal referee = makeAddr("referee");
    address internal beneficiary = makeAddr("beneficiary");
    address internal outsider = makeAddr("outsider");

    bool internal slotsLoaded;
    uint256 internal pledgesSlot;
    uint256 internal totalLockedSlot;
    uint256 internal pledgeIdsSlot;

    // Balance and allowance large enough that no test fails for want of funds, so a failure is
    // always the check under test.
    function _fund(address token, address account) internal {
        IMintableToken(token).mint(account, 1e24);
        vm.prank(account);
        IMintableToken(token).approve(address(satStake), 1e24);
    }

    function _loadSlots() internal {
        if (slotsLoaded) return;
        slotsLoaded = true;
        string memory json = vm.readFile(ARTIFACT);
        pledgesSlot = _slotOf(json, "_pledges");
        totalLockedSlot = _slotOf(json, "_totalLocked");
        pledgeIdsSlot = _slotOf(json, "_pledgeIds");
    }

    function _slotOf(string memory json, string memory label) internal view returns (uint256) {
        for (uint256 i = 0;; i++) {
            string memory entry = string.concat(".storageLayout.storage[", vm.toString(i), "]");
            if (!vm.keyExistsJson(json, entry)) break;
            if (!_eq(vm.parseJsonString(json, string.concat(entry, ".label")), label)) continue;
            return vm.parseUint(vm.parseJsonString(json, string.concat(entry, ".slot")));
        }
        revert(string.concat("storage variable not found: ", label));
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    function _word(uint256 slot) internal view returns (uint256) {
        return uint256(vm.load(address(satStake), bytes32(slot)));
    }

    // Value slot of `mapping(key => ...)` declared at `slot`.
    function _mappingSlot(uint256 key, uint256 slot) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(key, slot)));
    }

    function _mappingSlot(address key, uint256 slot) internal pure returns (uint256) {
        return _mappingSlot(uint256(uint160(key)), slot);
    }

    /// Reads the stored `Pledge` for `id` field by field, in the order and packing that the
    /// declaration in 05 section 1.1 produces: one slot each for `staker`, `token`, `amount`, and
    /// `referee`; `beneficiary` and `deadline` share the next, which holds 28 bytes; `createdAt`
    /// and `status` share the one after; `promiseText` has the last.
    function _storedPledge(uint256 id) internal returns (SatStake.Pledge memory p) {
        _loadSlots();
        uint256 base = _mappingSlot(id, pledgesSlot);
        p.staker = address(uint160(_word(base)));
        p.token = address(uint160(_word(base + 1)));
        p.amount = _word(base + 2);
        p.referee = address(uint160(_word(base + 3)));
        uint256 withBeneficiary = _word(base + 4);
        p.beneficiary = address(uint160(withBeneficiary));
        p.deadline = uint64(withBeneficiary >> 160);
        uint256 withCreatedAt = _word(base + 5);
        p.createdAt = uint64(withCreatedAt);
        p.status = SatStake.Status(uint8(withCreatedAt >> 64));
        p.promiseText = _storedString(base + 6);
    }

    /// Writes `status` into the stored record of `id`, leaving `createdAt`, which shares the slot,
    /// as it was. Lets a test reach a status no implemented function can yet produce.
    function _setStoredStatus(uint256 id, SatStake.Status status) internal {
        _loadSlots();
        uint256 slot = _mappingSlot(id, pledgesSlot) + 5;
        uint256 kept = _word(slot) & ~(uint256(0xff) << 64);
        vm.store(address(satStake), bytes32(slot), bytes32(kept | (uint256(uint8(status)) << 64)));
    }

    /// A short string lives in its own slot with twice its length in the last byte; a string of 32
    /// bytes or more stores twice its length plus one there and its bytes from `keccak256(slot)`.
    function _storedString(uint256 slot) internal view returns (string memory) {
        bytes32 head = bytes32(_word(slot));
        if (uint256(head) & 1 == 0) {
            uint256 shortLength = (uint256(head) & 0xff) / 2;
            bytes memory short = new bytes(shortLength);
            for (uint256 i = 0; i < shortLength; i++) {
                short[i] = head[i];
            }
            return string(short);
        }
        uint256 length = (uint256(head) - 1) / 2;
        bytes memory long = new bytes(length);
        uint256 data = uint256(keccak256(abi.encode(slot)));
        for (uint256 i = 0; i < length; i++) {
            bytes32 chunk = bytes32(_word(data + i / 32));
            long[i] = chunk[i % 32];
        }
        return string(long);
    }

    function _storedTotalLocked(address token) internal returns (uint256) {
        _loadSlots();
        return _word(_mappingSlot(token, totalLockedSlot));
    }

    function _storedPledgeIds(address account) internal returns (uint256[] memory ids) {
        _loadSlots();
        uint256 base = _mappingSlot(account, pledgeIdsSlot);
        uint256 length = _word(base);
        uint256 data = uint256(keccak256(abi.encode(base)));
        ids = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            ids[i] = _word(data + i);
        }
    }
}
