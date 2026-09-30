// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SatStake} from "../src/SatStake.sol";
import {Config, DeployScript, TokenConfig} from "../script/Deploy.s.sol";
import {
    AllowedTokensMismatch,
    ConstantMismatch,
    Expected,
    PledgeCountNotZero,
    PostDeployCheckScript,
    TokenDecimalsMismatch
} from "../script/PostDeployCheck.s.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";

/// @notice Reaches the two halves of the check that the script keeps internal: the expectations it
/// builds from a config, and the comparison of a deployment against them. They are internal in the
/// script so that a `forge script --sig` call cannot run the check against hand-supplied
/// expectations, which would pass whatever the deployment holds.
contract PostDeployCheckHarness is PostDeployCheckScript {
    function exposedExpectationsFrom(Config memory config) external pure returns (Expected memory) {
        return expectationsFrom(config);
    }

    function exposedCheckAgainst(address satStake, Expected memory expected) external view {
        checkAgainst(satStake, expected);
    }

    function exposedRecordedAddress() external view returns (address) {
        return recordedAddress();
    }
}

/// @notice The post-deploy check of LLR-DP-004. Every clause the requirement names gets a passing
/// case against a locally deployed contract and a failing case: a check that can only pass proves
/// nothing about a deployment.
contract PostDeployCheckTest is Test {
    uint256 internal constant ARC_TESTNET = 5042002;

    // Both confirmed on chain in Phase 0 (docs/evidence/phase0.md, check 4).
    address internal constant TESTNET_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant TESTNET_CIRBTC = 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF;

    // The tokens of `deployments/config/31337.json`, the fixture config.
    uint256 internal constant FIXTURE_CHAIN = 31337;
    address internal constant FIXTURE_TOKEN_6 = 0x00000000000000000000000000000000CAfe0006;
    address internal constant FIXTURE_TOKEN_8 = 0x00000000000000000000000000000000cafe0008;
    string internal constant FIXTURE_RECORD = "deployments/31337.json";

    PostDeployCheckHarness internal script;
    SatStake internal satStake;
    MockFiatToken internal usdc;
    MockFiatToken internal cirbtc;

    function setUp() public {
        script = new PostDeployCheckHarness();
        usdc = new MockFiatToken(6);
        cirbtc = new MockFiatToken(8);
        address[] memory tokens = new address[](2);
        (tokens[0], tokens[1]) = (address(usdc), address(cirbtc));
        satStake = new SatStake(tokens);
    }

    function _config() internal view returns (Config memory config) {
        config.chainId = block.chainid;
        config.tokens = new TokenConfig[](2);
        config.tokens[0] = TokenConfig({token: address(usdc), decimals: 6});
        config.tokens[1] = TokenConfig({token: address(cirbtc), decimals: 8});
    }

    function _expected() internal view returns (Expected memory) {
        return script.exposedExpectationsFrom(_config());
    }

    /// Replaces the two configured testnet tokens with mock code that answers `decimals()` with
    /// `usdcDecimals` and 8. The mock keeps its decimals in an immutable, so the value travels with
    /// the code and needs no storage of its own.
    function _etchTestnetTokens(uint8 usdcDecimals) internal {
        vm.etch(TESTNET_USDC, address(new MockFiatToken(usdcDecimals)).code);
        vm.etch(TESTNET_CIRBTC, address(new MockFiatToken(8)).code);
    }

    /// The same for the two tokens of the fixture config, which the config expects at 6 and 8.
    function _etchFixtureTokens() internal {
        vm.etch(FIXTURE_TOKEN_6, address(new MockFiatToken(6)).code);
        vm.etch(FIXTURE_TOKEN_8, address(new MockFiatToken(8)).code);
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_acceptsAFreshDeploymentThatMatchesTheConfig() public view {
        script.exposedCheckAgainst(address(satStake), _expected());
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_expectsTheFourConstantsAFreshDeploymentReports() public view {
        // `expectationsFrom` is pure and is given no address, so it cannot read these from the
        // deployment: the equality is between the values the requirements fix and what the
        // deployment answers.
        Expected memory expected = _expected();
        assertEq(expected.minDuration, satStake.MIN_DURATION());
        assertEq(expected.maxDuration, satStake.MAX_DURATION());
        assertEq(expected.maxPromiseBytes, satStake.MAX_PROMISE_BYTES());
        assertEq(expected.maxPage, satStake.MAX_PAGE());
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_failsWhenMinDurationDiffers() public {
        Expected memory expected = _expected();
        expected.minDuration = 61;
        vm.expectRevert(abi.encodeWithSelector(ConstantMismatch.selector, "MIN_DURATION", 61, 60));
        script.exposedCheckAgainst(address(satStake), expected);
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_failsWhenMaxDurationDiffers() public {
        Expected memory expected = _expected();
        expected.maxDuration = 364 days;
        vm.expectRevert(abi.encodeWithSelector(ConstantMismatch.selector, "MAX_DURATION", 364 days, 365 days));
        script.exposedCheckAgainst(address(satStake), expected);
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_failsWhenMaxPromiseBytesDiffers() public {
        Expected memory expected = _expected();
        expected.maxPromiseBytes = 281;
        vm.expectRevert(abi.encodeWithSelector(ConstantMismatch.selector, "MAX_PROMISE_BYTES", 281, 280));
        script.exposedCheckAgainst(address(satStake), expected);
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_failsWhenMaxPageDiffers() public {
        Expected memory expected = _expected();
        expected.maxPage = 1000;
        vm.expectRevert(abi.encodeWithSelector(ConstantMismatch.selector, "MAX_PAGE", 1000, 100));
        script.exposedCheckAgainst(address(satStake), expected);
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_failsWhenTheDeploymentAllowsATokenTheConfigDoesNot() public {
        Expected memory expected = _expected();
        expected.tokens = new address[](1);
        expected.tokens[0] = address(usdc);
        expected.decimals = new uint8[](1);
        expected.decimals[0] = 6;
        address[] memory allowed = satStake.allowedTokens();
        vm.expectRevert(abi.encodeWithSelector(AllowedTokensMismatch.selector, expected.tokens, allowed));
        script.exposedCheckAgainst(address(satStake), expected);
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_failsWhenTheConfigNamesATokenTheDeploymentDoesNotAllow() public {
        Expected memory expected = _expected();
        expected.tokens = new address[](3);
        (expected.tokens[0], expected.tokens[1], expected.tokens[2]) =
            (address(usdc), address(cirbtc), address(new MockFiatToken(18)));
        expected.decimals = new uint8[](3);
        (expected.decimals[0], expected.decimals[1], expected.decimals[2]) = (6, 8, 18);
        address[] memory allowed = satStake.allowedTokens();
        vm.expectRevert(abi.encodeWithSelector(AllowedTokensMismatch.selector, expected.tokens, allowed));
        script.exposedCheckAgainst(address(satStake), expected);
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_failsWhenTheAllowlistIsInAnotherOrder() public {
        // `allowedTokens()` answers with the constructor's list in its original order, and the
        // frontend reads it that way, so a swapped pair is a mismatch and not a detail.
        Expected memory expected = _expected();
        (expected.tokens[0], expected.tokens[1]) = (expected.tokens[1], expected.tokens[0]);
        (expected.decimals[0], expected.decimals[1]) = (expected.decimals[1], expected.decimals[0]);
        address[] memory allowed = satStake.allowedTokens();
        vm.expectRevert(abi.encodeWithSelector(AllowedTokensMismatch.selector, expected.tokens, allowed));
        script.exposedCheckAgainst(address(satStake), expected);
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_failsWhenATokenReportsOtherDecimals() public {
        Expected memory expected = _expected();
        expected.decimals[0] = 18;
        vm.expectRevert(abi.encodeWithSelector(TokenDecimalsMismatch.selector, address(usdc), 18, 6));
        script.exposedCheckAgainst(address(satStake), expected);
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_failsWhenTheSecondTokenReportsOtherDecimals() public {
        Expected memory expected = _expected();
        expected.decimals[1] = 6;
        vm.expectRevert(abi.encodeWithSelector(TokenDecimalsMismatch.selector, address(cirbtc), 6, 8));
        script.exposedCheckAgainst(address(satStake), expected);
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_failsWhenAPledgeAlreadyExists() public {
        address staker = makeAddr("staker");
        usdc.mint(staker, 1000);
        vm.startPrank(staker);
        usdc.approve(address(satStake), 1000);
        satStake.createPledge(
            address(usdc), 1000, makeAddr("referee"), makeAddr("beneficiary"), uint64(block.timestamp + 3600), "run"
        );
        vm.stopPrank();

        // Built before the expectation is armed: `_expected()` calls the script, and that call would
        // otherwise be the one `expectRevert` watched, which does not revert.
        Expected memory expected = _expected();
        vm.expectRevert(abi.encodeWithSelector(PledgeCountNotZero.selector, 1));
        script.exposedCheckAgainst(address(satStake), expected);
    }

    /// @custom:verifies LLR-DP-001 LLR-DP-004
    function test_DP004_acceptsWhatTheDeployScriptProducesForTheConfiguredChain() public {
        vm.chainId(ARC_TESTNET);
        _etchTestnetTokens(6);
        SatStake deployed = new DeployScript().run();
        assertTrue(address(deployed).code.length > 0, "the script deployed nothing");
        script.check(address(deployed));
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_failsWhenAConfiguredTokenReportsOtherDecimalsOnChain() public {
        vm.chainId(ARC_TESTNET);
        _etchTestnetTokens(18);
        SatStake deployed = new DeployScript().run();
        vm.expectRevert(abi.encodeWithSelector(TokenDecimalsMismatch.selector, TESTNET_USDC, 6, 18));
        script.check(address(deployed));
    }

    /// @custom:verifies LLR-DP-004
    function test_DP004_checksTheDeploymentRecordedForTheChainItRunsOn() public {
        vm.chainId(FIXTURE_CHAIN);
        _etchFixtureTokens();
        SatStake deployed = new DeployScript().run();
        // The key `address` is the one tools/record-deployment.mjs writes, pinned on that side by the
        // record test. With no run of its own, the script would read a key no record carries and the
        // failure would surface on a live network.
        vm.writeFile(
            FIXTURE_RECORD,
            string.concat(
                '{\n  "chainId": 31337,\n  "contract": "SatStake",\n  "address": "',
                vm.toString(address(deployed)),
                '"\n}\n'
            )
        );

        assertEq(script.exposedRecordedAddress(), address(deployed), "the recorded address was not read back");
        script.run();

        vm.removeFile(FIXTURE_RECORD);
    }
}
