// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Script} from "forge-std/Script.sol";
import {SatStake} from "../src/SatStake.sol";
import {Config, DeployConfig} from "./Deploy.s.sol";

/// @notice The deployment's allowlist is not the configured one, in content or in order.
/// @custom:trace LLR-DP-004
error AllowedTokensMismatch(address[] expectedTokens, address[] allowedTokens);

/// @notice An allowed token reports a different number of decimals than the config expects.
/// @custom:trace LLR-DP-004
error TokenDecimalsMismatch(address token, uint8 expectedDecimals, uint8 reportedDecimals);

/// @notice A public constant of the deployment differs from the value the requirements fix.
/// @custom:trace LLR-DP-004
error ConstantMismatch(string name, uint256 expectedValue, uint256 reportedValue);

/// @notice The deployment already holds pledges, so it is not the fresh deployment being checked.
/// @custom:trace LLR-DP-004
error PledgeCountNotZero(uint256 pledgeCount);

/// @notice What a fresh deployment must report.
struct Expected {
    address[] tokens;
    uint8[] decimals;
    uint64 minDuration;
    uint64 maxDuration;
    uint256 maxPromiseBytes;
    uint256 maxPage;
}

/// @notice Confirms a deployed SatStake against the config of the chain it is deployed on.
///
/// Runnable on its own against an address that was deployed earlier, which is how it is used after
/// a mainnet deployment:
///
///   forge script PostDeployCheckScript --rpc-url arc_testnet --sig 'check(address)' <address>
///
/// With no `--sig` it takes the address from `deployments/<chainId>.json`.
/// @custom:trace LLR-DP-004
contract PostDeployCheckScript is Script {
    /// @notice Checks the deployment recorded for this chain.
    function run() external view {
        check(recordedAddress()); // LLR-DP-004
    }

    /// @notice The address recorded in `deployments/<chainId>.json`.
    function recordedAddress() internal view returns (address) {
        string memory record = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".json"));
        return vm.parseJsonAddress(record, ".address");
    }

    /// @notice Checks `satStake` against the config of the chain this run is against.
    function check(address satStake) public view {
        checkAgainst(satStake, expectationsFrom(DeployConfig.loadForChain())); // LLR-DP-004
    }

    /// @notice What a fresh deployment for `config` must report.
    ///
    /// Internal, with `checkAgainst`, so that the only way to run the check from a command line is
    /// against the config of the chain: expectations a caller supplied would pass whatever the
    /// deployment holds.
    function expectationsFrom(Config memory config) internal pure returns (Expected memory expected) {
        expected.tokens = new address[](config.tokens.length);
        expected.decimals = new uint8[](config.tokens.length);
        for (uint256 i = 0; i < config.tokens.length; i++) {
            expected.tokens[i] = config.tokens[i].token;
            expected.decimals[i] = config.tokens[i].decimals;
        }
        // The values 05 section 1.1 fixes for the four public constants, written out rather than
        // read from the contract: a check that took them from the deployment would only compare it
        // with itself.
        expected.minDuration = 60;
        expected.maxDuration = 365 days;
        expected.maxPromiseBytes = 280;
        expected.maxPage = 100;
    }

    /// @notice Reverts unless `satStake` reports everything `expected` names.
    function checkAgainst(address satStake, Expected memory expected) internal view {
        address[] memory allowed = SatStake(satStake).allowedTokens();
        if (allowed.length != expected.tokens.length) revert AllowedTokensMismatch(expected.tokens, allowed); // LLR-DP-004
        for (uint256 i = 0; i < allowed.length; i++) {
            if (allowed[i] != expected.tokens[i]) revert AllowedTokensMismatch(expected.tokens, allowed); // LLR-DP-004
        }

        _sameConstant("MIN_DURATION", expected.minDuration, SatStake(satStake).MIN_DURATION()); // LLR-DP-004
        _sameConstant("MAX_DURATION", expected.maxDuration, SatStake(satStake).MAX_DURATION()); // LLR-DP-004
        _sameConstant("MAX_PROMISE_BYTES", expected.maxPromiseBytes, SatStake(satStake).MAX_PROMISE_BYTES()); // LLR-DP-004
        _sameConstant("MAX_PAGE", expected.maxPage, SatStake(satStake).MAX_PAGE()); // LLR-DP-004

        uint256 count = SatStake(satStake).pledgeCount();
        if (count != 0) revert PledgeCountNotZero(count); // LLR-DP-004

        for (uint256 i = 0; i < allowed.length; i++) {
            uint8 reported = IERC20Metadata(allowed[i]).decimals();
            if (reported != expected.decimals[i]) {
                revert TokenDecimalsMismatch(allowed[i], expected.decimals[i], reported); // LLR-DP-004
            }
        }
    }

    function _sameConstant(string memory name, uint256 expectedValue, uint256 reported) private pure {
        if (reported != expectedValue) revert ConstantMismatch(name, expectedValue, reported);
    }
}
