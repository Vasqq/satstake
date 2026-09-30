// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {Vm} from "forge-std/Vm.sol";
import {SatStake} from "../src/SatStake.sol";

/// @notice The config file names the chain it was written for, and it disagrees with the chain the
/// script is running against.
/// @custom:trace LLR-DP-001
error ChainIdMismatch(uint256 configChainId, uint256 runningChainId);

/// @notice One allowlisted token: the address SatStake is constructed with, and the number of
/// decimals it is expected to report.
struct TokenConfig {
    address token;
    uint8 decimals;
}

/// @notice The deployment input of one chain, as held in `deployments/config/<chainId>.json`.
struct Config {
    uint256 chainId;
    TokenConfig[] tokens;
}

/// @notice Reads a deployment config and refuses one written for another chain.
///
/// A library rather than part of the script, so that the post-deploy check reads the same file the
/// deployment read, through the same code.
/// @custom:trace LLR-DP-001
library DeployConfig {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @notice The config file of `chainId`.
    function pathFor(uint256 chainId) internal pure returns (string memory) {
        return string.concat("deployments/config/", VM.toString(chainId), ".json"); // LLR-DP-001
    }

    /// @notice The config of the chain the script is running against.
    function loadForChain() internal view returns (Config memory) {
        return load(pathFor(block.chainid)); // LLR-DP-001
    }

    /// @notice The config held in `path`, refused unless it was written for this chain.
    function load(string memory path) internal view returns (Config memory config) {
        string memory json = VM.readFile(path); // LLR-DP-001
        config.chainId = VM.parseJsonUint(json, ".chainId");
        // Before the tokens are read, so a config meant for another network cannot reach a
        // constructor argument.
        if (config.chainId != block.chainid) revert ChainIdMismatch(config.chainId, block.chainid); // LLR-DP-001

        uint256 count = 0;
        while (VM.keyExistsJson(json, _entry(count))) {
            count++;
        }
        config.tokens = new TokenConfig[](count);
        for (uint256 i = 0; i < count; i++) {
            config.tokens[i].token = VM.parseJsonAddress(json, string.concat(_entry(i), ".address")); // LLR-DP-001
            config.tokens[i].decimals = uint8(VM.parseJsonUint(json, string.concat(_entry(i), ".decimals")));
        }
    }

    /// @notice The token addresses of `config`, in file order, as SatStake's constructor takes them.
    function allowlist(Config memory config) internal pure returns (address[] memory tokens) {
        tokens = new address[](config.tokens.length);
        for (uint256 i = 0; i < config.tokens.length; i++) {
            tokens[i] = config.tokens[i].token;
        }
    }

    function _entry(uint256 index) private pure returns (string memory) {
        return string.concat(".tokens[", VM.toString(index), "]");
    }
}

/// @notice Deploys SatStake with the token allowlist of the chain it is run against.
///
/// The script reads no private key. It broadcasts with whatever sender the command line supplies,
/// so there is no code path that could carry a raw key.
/// @custom:trace LLR-DP-001
contract DeployScript is Script {
    /// @notice The config file this run reads.
    function configPath() internal view returns (string memory) {
        return DeployConfig.pathFor(block.chainid); // LLR-DP-001
    }

    /// @notice The config of the chain this run is against.
    function loadConfig() internal view returns (Config memory) {
        return DeployConfig.loadForChain(); // LLR-DP-001
    }

    /// @notice The config held in `path`, refused unless it was written for this chain.
    ///
    /// Takes a path so that a missing, malformed or chain-less config can be driven from a test. No
    /// deployment reaches the config this way: `run` reads the file the running chain names.
    ///
    /// Internal, with the rest, so `run` is the script's whole public surface: a `--sig` call cannot
    /// make a deployment read a config the running chain does not name.
    function loadConfigFrom(string memory path) internal view returns (Config memory) {
        return DeployConfig.load(path);
    }

    /// @notice Deploys SatStake with the configured allowlist.
    function run() external returns (SatStake satStake) {
        Config memory config = loadConfig(); // LLR-DP-001
        vm.startBroadcast();
        satStake = new SatStake(DeployConfig.allowlist(config)); // LLR-DP-001
        vm.stopBroadcast();
    }
}
