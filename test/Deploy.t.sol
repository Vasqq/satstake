// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SatStake} from "../src/SatStake.sol";
import {ChainIdMismatch, Config, DeployScript} from "../script/Deploy.s.sol";

/// @notice Reaches the config reading the script keeps internal, so that `run` is the script's whole
/// public surface and no `--sig` call can make a deployment read a config the running chain does not
/// name.
contract DeployHarness is DeployScript {
    function exposedConfigPath() external view returns (string memory) {
        return configPath();
    }

    function exposedLoadConfig() external view returns (Config memory) {
        return loadConfig();
    }

    function exposedLoadConfigFrom(string memory path) external view returns (Config memory) {
        return loadConfigFrom(path);
    }
}

/// @notice The deploy script's two obligations under LLR-DP-001: it takes the allowlist from
/// `deployments/config/<chainId>.json`, and it refuses to run on a chain the file was not written
/// for.
///
/// Every config these tests read is a committed file, never one written by the test, since
/// `fs_permissions` grants only read on `deployments/config`. Two of them exist for the tests alone
/// and each says so in a `note` field: `31337.json`, whose addresses and order no other config
/// shares, and `1337.json`, whose recorded chain ID is deliberately wrong.
contract DeployScriptTest is Test {
    uint256 internal constant ARC_TESTNET = 5042002;
    uint256 internal constant ARC_MAINNET = 5042;
    string internal constant TESTNET_CONFIG = "deployments/config/5042002.json";

    // Both confirmed on chain in Phase 0 (docs/evidence/phase0.md, check 4).
    address internal constant TESTNET_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant TESTNET_CIRBTC = 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF;

    // `deployments/config/31337.json`, the second config on disk. Its addresses appear in no other
    // config, so a script that deployed a built-in list could match at most one of the two files.
    uint256 internal constant FIXTURE_CHAIN = 31337;
    address internal constant FIXTURE_TOKEN_6 = 0x00000000000000000000000000000000CAfe0006;
    address internal constant FIXTURE_TOKEN_8 = 0x00000000000000000000000000000000cafe0008;

    // `deployments/config/1337.json`, whose recorded chain ID is 31337: the mistake of copying a
    // config for a new chain and leaving the old chain ID in it.
    uint256 internal constant MISLABELLED_CHAIN = 1337;

    DeployHarness internal script;

    function setUp() public {
        script = new DeployHarness();
    }

    /// The reason a failed call reverted, as a string, or the empty string if it carried no string.
    /// A failing cheatcode reverts with `CheatcodeError(string)` rather than `Error(string)`, and
    /// both carry one string, so either is decoded the same way.
    function _revertMessage(bytes memory reason) internal pure returns (string memory) {
        bytes4 selector = reason.length < 4 ? bytes4(0) : bytes4(reason);
        if (selector != bytes4(keccak256("Error(string)")) && selector != bytes4(keccak256("CheatcodeError(string)"))) {
            return "";
        }
        bytes memory payload = new bytes(reason.length - 4);
        for (uint256 i = 4; i < reason.length; i++) {
            payload[i - 4] = reason[i];
        }
        return abi.decode(payload, (string));
    }

    /// @custom:verifies LLR-DP-001
    function test_DP001_namesTheConfigFileAfterTheChainItRunsOn() public {
        vm.chainId(ARC_TESTNET);
        assertEq(script.exposedConfigPath(), TESTNET_CONFIG);
        vm.chainId(ARC_MAINNET);
        assertEq(script.exposedConfigPath(), "deployments/config/5042.json");
    }

    /// @custom:verifies LLR-DP-001
    function test_DP001_readsTheTokenAllowlistOfTheRunningChain() public {
        vm.chainId(ARC_TESTNET);
        Config memory config = script.exposedLoadConfig();
        assertEq(config.chainId, ARC_TESTNET);
        assertEq(config.tokens.length, 2);
        assertEq(config.tokens[0].token, TESTNET_USDC);
        assertEq(config.tokens[1].token, TESTNET_CIRBTC);
    }

    /// @custom:verifies LLR-DP-001
    function test_DP001_deploysTheAllowlistTheConfigNames() public {
        vm.chainId(ARC_TESTNET);
        // The constructor refuses a token with no deployed code, and the testnet tokens have none in
        // the test EVM. One byte of code is enough for that check.
        vm.etch(TESTNET_USDC, hex"00");
        vm.etch(TESTNET_CIRBTC, hex"00");

        SatStake deployed = script.run();

        assertTrue(address(deployed).code.length > 0, "the script deployed nothing");
        address[] memory allowed = deployed.allowedTokens();
        assertEq(allowed.length, 2);
        assertEq(allowed[0], TESTNET_USDC);
        assertEq(allowed[1], TESTNET_CIRBTC);
    }

    /// @custom:verifies LLR-DP-001
    function test_DP001_deploysTheOtherConfigsAllowlistOnTheOtherChain() public {
        vm.chainId(FIXTURE_CHAIN);
        vm.etch(FIXTURE_TOKEN_6, hex"00");
        vm.etch(FIXTURE_TOKEN_8, hex"00");

        SatStake deployed = script.run();

        // The pair, and the order, of the 31337 config rather than of the testnet config. That file
        // lists the higher address first, so a script that sorted its allowlist fails here while
        // still agreeing with the testnet config, whose entries happen to ascend.
        address[] memory allowed = deployed.allowedTokens();
        assertEq(allowed.length, 2);
        assertEq(allowed[0], FIXTURE_TOKEN_8);
        assertEq(allowed[1], FIXTURE_TOKEN_6);
    }

    /// @custom:verifies LLR-DP-001
    function test_DP001_revertsWhenTheConfigWasWrittenForAnotherChain() public {
        vm.chainId(ARC_MAINNET);
        vm.expectRevert(abi.encodeWithSelector(ChainIdMismatch.selector, ARC_TESTNET, ARC_MAINNET));
        script.exposedLoadConfigFrom(TESTNET_CONFIG);
    }

    /// @custom:verifies LLR-DP-001
    function test_DP001_runItselfRefusesAConfigWrittenForAnotherChain() public {
        // The path a deployment takes: no test seam, no path argument, the file the running chain
        // names. A guard the deploy path does not reach would let a copied config deploy the wrong
        // token addresses.
        vm.chainId(MISLABELLED_CHAIN);
        vm.expectRevert(abi.encodeWithSelector(ChainIdMismatch.selector, FIXTURE_CHAIN, MISLABELLED_CHAIN));
        script.run();
    }

    /// @custom:verifies LLR-DP-001
    function test_DP001_revertsOnEveryChainButTheConfigsOwn(uint256 chainId) public {
        chainId = bound(chainId, 1, type(uint64).max);
        vm.assume(chainId != ARC_TESTNET);
        vm.chainId(chainId);
        vm.expectRevert(abi.encodeWithSelector(ChainIdMismatch.selector, ARC_TESTNET, chainId));
        script.exposedLoadConfigFrom(TESTNET_CONFIG);
    }

    /// @custom:verifies LLR-DP-001
    function test_DP001_aMissingConfigFailsOnTheReadAndNotAsAChainMismatch() public {
        // A chain with no config file at all. Reporting that as a mismatch would send an operator
        // looking for a wrong chain ID inside a file that does not exist.
        vm.chainId(31338);
        (bool ok, bytes memory reason) = address(script).call(abi.encodeCall(DeployHarness.exposedLoadConfig, ()));
        assertFalse(ok, "a missing config was read as a valid one");
        // The file name in the message is an absolute path on the machine that ran the test, so only
        // the part of the message that names what went wrong is asserted.
        assertTrue(
            vm.contains(_revertMessage(reason), "vm.readFile: failed to read from"),
            "a missing config did not fail on the file read"
        );
    }

    /// @custom:verifies LLR-DP-001
    function test_DP001_aConfigThatIsNotJsonFailsOnTheParseAndNotAsAChainMismatch() public {
        vm.chainId(ARC_TESTNET);
        // The contract source stands in for a file that is not JSON at all; `fs_permissions` in
        // foundry.toml already grants the read, so the case needs no fixture of its own.
        (bool ok, bytes memory reason) =
            address(script).call(abi.encodeCall(DeployHarness.exposedLoadConfigFrom, ("src/SatStake.sol")));
        assertFalse(ok, "a file that is not JSON was read as a config");
        assertEq(
            _revertMessage(reason),
            "vm.parseJsonUint: failed parsing JSON: expected value at line 1 column 1",
            "a file that is not JSON did not fail on the parse"
        );
    }

    /// @custom:verifies LLR-DP-001
    function test_DP001_jsonWithNoChainIdFailsOnTheMissingKeyAndNotAsAChainMismatch() public {
        vm.chainId(ARC_TESTNET);
        // Valid JSON with none of the keys a config has: the compiled artifact.
        (bool ok, bytes memory reason) = address(script).call(
            abi.encodeCall(DeployHarness.exposedLoadConfigFrom, ("out/SatStake.sol/SatStake.json"))
        );
        assertFalse(ok, "JSON with no chain ID was read as a config");
        assertEq(
            _revertMessage(reason),
            "vm.parseJsonUint: path \".chainId\" must return exactly one JSON value",
            "JSON with no chain ID did not fail on the missing key"
        );
    }
}
