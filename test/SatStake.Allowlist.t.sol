// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {SatStake} from "../src/SatStake.sol";
import {Artifact} from "./base/Artifact.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";

/// @notice The token allowlist: constructor validation, the two allowlist views, and the absence
/// of any way to change the list after deployment.
contract SatStakeAllowlistTest is Test {
    // Five deployed tokens, so that a list one entry too long can be built from valid entries.
    address[5] internal tokens;
    address internal eoa;

    function setUp() public {
        for (uint256 i = 0; i < 5; i++) {
            tokens[i] = address(new MockFiatToken(6));
        }
        eoa = makeAddr("eoa");
    }

    function _list(address a) internal pure returns (address[] memory l) {
        l = new address[](1);
        l[0] = a;
    }

    function _list(address a, address b) internal pure returns (address[] memory l) {
        l = new address[](2);
        (l[0], l[1]) = (a, b);
    }

    function _list(address a, address b, address c) internal pure returns (address[] memory l) {
        l = new address[](3);
        (l[0], l[1], l[2]) = (a, b, c);
    }

    function _list(address a, address b, address c, address d) internal pure returns (address[] memory l) {
        l = new address[](4);
        (l[0], l[1], l[2], l[3]) = (a, b, c, d);
    }

    // The first `n` deployed tokens, in deployment order.
    function _firstTokens(uint256 n) internal view returns (address[] memory l) {
        l = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            l[i] = tokens[i];
        }
    }

    function _expectInvalid(address[] memory list) internal {
        vm.expectRevert(SatStake.InvalidAllowlist.selector);
        new SatStake(list);
    }

    function _contains(address[] memory list, address a) internal pure returns (bool) {
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == a) return true;
        }
        return false;
    }

    // Every observable part of the allowlist: the list itself, membership of each deployed token
    // and of the two addresses that must never be members, and membership of `probe`.
    function _assertAllowlistIs(SatStake s, address[] memory expected, address probe) internal view {
        assertEq(s.allowedTokens(), expected);
        for (uint256 i = 0; i < tokens.length; i++) {
            assertEq(s.isAllowedToken(tokens[i]), _contains(expected, tokens[i]));
        }
        assertFalse(s.isAllowedToken(address(0)));
        assertFalse(s.isAllowedToken(eoa));
        assertEq(s.isAllowedToken(probe), _contains(expected, probe));
    }

    // Selectors of every external and public function in the compiled contract, so that a
    // function added by a later group is exercised here without editing this test.
    function _allSelectors() internal view returns (bytes4[] memory selectors) {
        string[] memory signatures = vm.parseJsonKeys(Artifact.json(), ".methodIdentifiers");
        selectors = new bytes4[](signatures.length);
        for (uint256 i = 0; i < signatures.length; i++) {
            selectors[i] = bytes4(keccak256(bytes(signatures[i])));
        }
    }

    /// @custom:verifies LLR-SC-013
    function test_SC013_revertsWithZeroTokens() public {
        _expectInvalid(new address[](0));
    }

    /// @custom:verifies LLR-SC-013
    function test_SC013_acceptsOneToken() public {
        SatStake s = new SatStake(_list(tokens[0]));
        assertEq(s.allowedTokens(), _list(tokens[0]));
    }

    /// @custom:verifies LLR-SC-013
    function test_SC013_acceptsFourTokens() public {
        SatStake s = new SatStake(_firstTokens(4));
        assertEq(s.allowedTokens(), _firstTokens(4));
    }

    /// @custom:verifies LLR-SC-013
    function test_SC013_revertsWithFiveTokens() public {
        _expectInvalid(_firstTokens(5));
    }

    /// @custom:verifies LLR-SC-013
    function test_SC013_revertsOnZeroAddressAtEachPosition() public {
        for (uint256 n = 1; n <= 4; n++) {
            for (uint256 pos = 0; pos < n; pos++) {
                address[] memory list = _firstTokens(n);
                list[pos] = address(0);
                _expectInvalid(list);
            }
        }
    }

    /// @custom:verifies LLR-SC-013
    function test_SC013_revertsOnZeroAddressEvenWithCode() public {
        // The zero address is rejected in its own right, not only because it usually has no code.
        vm.etch(address(0), hex"00");
        for (uint256 pos = 0; pos < 4; pos++) {
            address[] memory list = _firstTokens(4);
            list[pos] = address(0);
            _expectInvalid(list);
        }
    }

    /// @custom:verifies LLR-SC-013
    function test_SC013_revertsOnAddressWithoutCodeAtEachPosition() public {
        assertEq(eoa.code.length, 0);
        for (uint256 n = 1; n <= 4; n++) {
            for (uint256 pos = 0; pos < n; pos++) {
                address[] memory list = _firstTokens(n);
                list[pos] = eoa;
                _expectInvalid(list);
            }
        }
    }

    /// @custom:verifies LLR-SC-013
    function test_SC013_revertsOnAdjacentDuplicate() public {
        _expectInvalid(_list(tokens[0], tokens[0]));
        _expectInvalid(_list(tokens[0], tokens[1], tokens[1]));
        _expectInvalid(_list(tokens[0], tokens[1], tokens[2], tokens[2]));
    }

    /// @custom:verifies LLR-SC-013
    function test_SC013_revertsOnNonAdjacentDuplicate() public {
        _expectInvalid(_list(tokens[0], tokens[1], tokens[0]));
        _expectInvalid(_list(tokens[0], tokens[1], tokens[2], tokens[0]));
        _expectInvalid(_list(tokens[1], tokens[0], tokens[2], tokens[0]));
    }

    /// @custom:verifies LLR-SC-013
    function test_SC013_emitsTokenAllowedOncePerTokenInOrder() public {
        address[] memory four = _list(tokens[3], tokens[0], tokens[2], tokens[1]);
        _assertTokenAllowedLogs(four);
        _assertTokenAllowedLogs(_list(tokens[4]));
    }

    function _assertTokenAllowedLogs(address[] memory list) internal {
        vm.recordLogs();
        SatStake s = new SatStake(list);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, list.length);
        for (uint256 i = 0; i < logs.length; i++) {
            assertEq(logs[i].emitter, address(s));
            assertEq(logs[i].topics.length, 2);
            assertEq(logs[i].topics[0], SatStake.TokenAllowed.selector);
            assertEq(logs[i].topics[1], bytes32(uint256(uint160(list[i]))));
            assertEq(logs[i].data.length, 0);
        }
    }

    /// @custom:verifies LLR-SC-013 LLR-SC-054
    function test_SC013_recordsEachTokenAsAllowed() public {
        address[] memory list = _list(tokens[2], tokens[0], tokens[3], tokens[1]);
        SatStake s = new SatStake(list);
        for (uint256 i = 0; i < list.length; i++) {
            assertTrue(s.isAllowedToken(list[i]));
        }
        assertFalse(s.isAllowedToken(tokens[4]));
    }

    /// @custom:verifies LLR-SC-013
    function test_SC013_revertsUnlessListIsValid(uint256 length, uint256 seed) public {
        // Entries drawn from a pool of the zero address, an address without code, and the five
        // deployed tokens, so that every kind of invalid entry and every length from 0 to 6 occur.
        length = bound(length, 0, 6);
        address[7] memory pool = [address(0), eoa, tokens[0], tokens[1], tokens[2], tokens[3], tokens[4]];
        address[] memory list = new address[](length);
        bool valid = length >= 1 && length <= 4;
        for (uint256 i = 0; i < length; i++) {
            uint256 pick = uint8(seed >> (8 * i)) % pool.length;
            if (pick < 2 || _contains(list, pool[pick])) valid = false;
            list[i] = pool[pick];
        }
        if (valid) {
            SatStake s = new SatStake(list);
            assertEq(s.allowedTokens(), list);
        } else {
            _expectInvalid(list);
        }
    }

    /// @custom:verifies LLR-SC-054
    function test_SC054_allowedTokensKeepsConstructorOrder() public {
        // Two orders of the same set: an implementation that sorts or reorders fails one of them.
        address[] memory ascending = _firstTokens(4);
        address[] memory shuffled = _list(tokens[3], tokens[1], tokens[0], tokens[2]);
        assertEq(new SatStake(ascending).allowedTokens(), ascending);
        assertEq(new SatStake(shuffled).allowedTokens(), shuffled);
    }

    /// @custom:verifies LLR-SC-054
    function test_SC054_isAllowedTokenReportsMembership() public {
        address[] memory list = _list(tokens[1], tokens[3]);
        SatStake s = new SatStake(list);
        assertTrue(s.isAllowedToken(tokens[1]));
        assertTrue(s.isAllowedToken(tokens[3]));
        assertFalse(s.isAllowedToken(tokens[0]));
        assertFalse(s.isAllowedToken(tokens[2]));
        assertFalse(s.isAllowedToken(tokens[4]));
        assertFalse(s.isAllowedToken(address(0)));
        assertFalse(s.isAllowedToken(eoa));
        assertFalse(s.isAllowedToken(address(s)));
    }

    /// @custom:verifies LLR-SC-054
    function test_SC054_isAllowedTokenMatchesList(address probe) public {
        address[] memory list = _list(tokens[0], tokens[2], tokens[4]);
        SatStake s = new SatStake(list);
        _assertAllowlistIs(s, list, probe);
    }

    /// @custom:verifies LLR-SC-014
    function test_SC014_everyFunctionLeavesAllowlistUnchanged(address caller, bytes calldata args, address probe)
        public
    {
        address[] memory list = _list(tokens[2], tokens[0], tokens[3]);
        SatStake s = new SatStake(list);
        _assertAllowlistIs(s, list, probe);

        bytes4[] memory selectors = _allSelectors();
        assertGt(selectors.length, 0);
        bytes[] memory candidates = _candidateArgs(probe);
        // The deployer as well as an arbitrary caller: a function gated to the deployer is still
        // a way to change the list after construction.
        address[2] memory callers = [caller, address(this)];
        for (uint256 c = 0; c < callers.length; c++) {
            for (uint256 i = 0; i < selectors.length; i++) {
                _callAndCheck(s, list, probe, callers[c], abi.encodePacked(selectors[i], args));
                for (uint256 j = 0; j < candidates.length; j++) {
                    _callAndCheck(s, list, probe, callers[c], abi.encodePacked(selectors[i], candidates[j]));
                }
            }
        }
        _assertAllowlistIs(s, list, probe);
    }

    function _callAndCheck(SatStake s, address[] memory list, address probe, address caller, bytes memory data)
        internal
    {
        vm.prank(caller);
        (bool success,) = address(s).call(data);
        // A reverted call changes nothing, so only a successful one could alter the list.
        if (success) _assertAllowlistIs(s, list, probe);
    }

    // Arguments naming every address the list could gain or lose, alone and after a small index,
    // so that a function taking an address, or an index and an address, would change the list if
    // it could. Fuzzed arguments alone would rarely name a deployed token.
    function _candidateArgs(address probe) internal view returns (bytes[] memory args) {
        address[8] memory who = [tokens[0], tokens[1], tokens[2], tokens[3], tokens[4], address(0), eoa, probe];
        args = new bytes[](who.length * 5);
        uint256 n;
        for (uint256 i = 0; i < who.length; i++) {
            address c = who[i];
            args[n++] = abi.encode(c, c, c, c);
            for (uint256 k = 0; k < 4; k++) {
                args[n++] = abi.encode(k, c, c, c);
            }
        }
    }

    /// @custom:verifies LLR-SC-014
    function test_SC014_arbitraryCalldataLeavesAllowlistUnchanged(address caller, bytes calldata data, address probe)
        public
    {
        address[] memory list = _list(tokens[1], tokens[4]);
        SatStake s = new SatStake(list);
        _assertAllowlistIs(s, list, probe);

        vm.prank(caller);
        (bool success,) = address(s).call(data);
        if (success) _assertAllowlistIs(s, list, probe);
        _assertAllowlistIs(s, list, probe);
    }
}
