// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SatStake} from "../src/SatStake.sol";
import {SatStakeTestBase} from "./base/SatStakeTestBase.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";

/// @notice One pledge whose payout the token refuses does not reach any other pledge. The invariant
/// suite shows that such a failure changes nothing; these tests show the other half, that everything
/// else still works afterwards and that the refused pledge itself settles once the refusal is lifted.
contract SatStakeIsolationTest is SatStakeTestBase {
    uint64 internal constant DURATION = 1 days;

    MockFiatToken internal usdc;
    MockFiatToken internal cirbtc;

    // A second beneficiary, so that blocking one pledge's recipient leaves another pledge with a
    // recipient the token still accepts.
    address internal otherBeneficiary = makeAddr("other beneficiary");

    function setUp() public {
        vm.warp(1_700_000_000);

        // Deployed here, so this contract is the issuer and can work the blocklist and the pause.
        usdc = new MockFiatToken(6);
        cirbtc = new MockFiatToken(8);

        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(cirbtc);
        satStake = new SatStake(tokens);

        _fund(address(usdc), staker);
        _fund(address(cirbtc), staker);
    }

    function _create(address token, uint256 amount, address beneficiary_) internal returns (uint256 id) {
        vm.prank(staker);
        id = satStake.createPledge(
            token, amount, referee, beneficiary_, uint64(block.timestamp + DURATION), "Ship the demo"
        );
    }

    /// @custom:verifies LLR-SC-075
    function test_SC075_aBlockedBeneficiaryStopsOnlyItsOwnSettlement() public {
        uint256 blocked = _create(address(usdc), 1000, beneficiary);
        vm.prank(referee);
        satStake.markBroken(blocked);

        uint256 other = _create(address(usdc), 2500, otherBeneficiary);

        SatStake.Pledge memory blockedBefore = satStake.getPledge(blocked);
        uint256 lockedBefore = satStake.totalLocked(address(usdc));
        uint256 contractBefore = usdc.balanceOf(address(satStake));

        usdc.blocklist(beneficiary);
        vm.expectRevert(abi.encodeWithSelector(MockFiatToken.Blocklisted.selector, beneficiary));
        satStake.settle(blocked);

        // The refused pledge is untouched, and so is the stake behind it.
        _assertSameRecord(blocked, blockedBefore);
        assertEq(satStake.totalLocked(address(usdc)), lockedBefore);
        assertEq(usdc.balanceOf(address(satStake)), contractBefore);
        assertEq(usdc.balanceOf(beneficiary), 0);

        // Creatable: the next pledge takes the next identifier and locks its stake as usual.
        uint256 fresh = _create(address(usdc), 700, otherBeneficiary);
        assertEq(fresh, other + 1);
        assertEq(satStake.totalLocked(address(usdc)), lockedBefore + 700);

        // Verdict-able, and settleable in full to the account the table names.
        vm.prank(referee);
        satStake.markKept(other);
        uint256 stakerBefore = usdc.balanceOf(staker);
        satStake.settle(other);
        assertEq(usdc.balanceOf(staker), stakerBefore + 2500);
        assertEq(uint8(satStake.stateOf(other)), uint8(SatStake.PledgeState.SettledToStaker));

        // Settleable on the expired path too, while the block is still in place.
        vm.warp(block.timestamp + DURATION);
        satStake.settle(fresh);
        assertEq(usdc.balanceOf(otherBeneficiary), 700);

        // And the refused pledge settles in full once the token accepts its recipient again.
        usdc.unBlocklist(beneficiary);
        satStake.settle(blocked);
        assertEq(usdc.balanceOf(beneficiary), 1000);
        assertEq(uint8(satStake.stateOf(blocked)), uint8(SatStake.PledgeState.SettledToBeneficiary));
        assertEq(satStake.totalLocked(address(usdc)), 0);
    }

    /// A pause stops every transfer in one token. The pledges in the other token are unaffected,
    /// which is the same isolation seen across recipients rather than across tokens.
    /// @custom:verifies LLR-SC-075
    function test_SC075_aPausedTokenStopsOnlyItsOwnToken() public {
        uint256 paused = _create(address(usdc), 1000, beneficiary);
        vm.prank(referee);
        satStake.markKept(paused);

        SatStake.Pledge memory pausedBefore = satStake.getPledge(paused);
        usdc.pause();
        vm.expectRevert(MockFiatToken.TokenPaused.selector);
        satStake.settle(paused);
        _assertSameRecord(paused, pausedBefore);

        // The other token runs the whole lifecycle while the first is paused.
        uint256 free = _create(address(cirbtc), 4242, otherBeneficiary);
        vm.prank(referee);
        satStake.markBroken(free);
        satStake.settle(free);
        assertEq(cirbtc.balanceOf(otherBeneficiary), 4242);
        assertEq(satStake.totalLocked(address(cirbtc)), 0);

        usdc.unpause();
        uint256 stakerBefore = usdc.balanceOf(staker);
        satStake.settle(paused);
        assertEq(usdc.balanceOf(staker), stakerBefore + 1000);
        assertEq(satStake.totalLocked(address(usdc)), 0);
    }
}
