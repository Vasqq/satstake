// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SatStake} from "../src/SatStake.sol";
import {SatStakeTestBase} from "./base/SatStakeTestBase.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";

/// @notice Tokens sent straight to the contract, outside `createPledge` (UJ-63). The contract has
/// no function that could return them, so the claim is that they change nothing else: the locked
/// total, the amount each pledge receives at creation, and every payout stay exactly what the
/// pledges say, and the donation is still in the contract at the end.
contract SatStakeDonationTest is SatStakeTestBase {
    uint256 internal constant DONATION = 777;
    uint256 internal constant LATER_DONATION = 123;

    MockFiatToken internal usdc;
    MockFiatToken internal cirbtc;
    address internal donor = makeAddr("donor");

    function setUp() public {
        vm.warp(1_700_000_000);
        usdc = new MockFiatToken(6);
        cirbtc = new MockFiatToken(8);
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(cirbtc);
        satStake = new SatStake(tokens);
        _fund(address(usdc), staker);
        _fund(address(cirbtc), staker);
    }

    function _donate(MockFiatToken token, uint256 amount) internal {
        token.mint(donor, amount);
        vm.prank(donor);
        require(token.transfer(address(satStake), amount));
    }

    function _create(MockFiatToken token, uint256 amount, uint64 duration) internal returns (uint256 id) {
        vm.prank(staker);
        id = satStake.createPledge(
            address(token), amount, referee, beneficiary, uint64(block.timestamp + duration), "Ship the demo"
        );
    }

    /// @custom:verifies LLR-SC-027 LLR-SC-028 LLR-SC-041 LLR-SC-070 LLR-SC-071
    function test_SC070_tokensSentDirectlyChangeNeitherTheLockedTotalNorAnyPayoutAndStayInTheContract() public {
        _donate(usdc, DONATION);
        assertEq(satStake.totalLocked(address(usdc)), 0, "a donation is not a stake");

        // A donation between a staker's approval and the creation must not be read as part of the stake.
        uint256 kept = _create(usdc, 1000, 1 days);
        assertEq(satStake.totalLocked(address(usdc)), 1000);
        assertEq(usdc.balanceOf(address(satStake)), DONATION + 1000);

        _donate(usdc, LATER_DONATION);
        uint256 broken = _create(usdc, 2000, 1 days);
        uint256 expired = _create(usdc, 4000, 60);
        uint256 otherToken = _create(cirbtc, 500, 1 days);
        assertEq(satStake.totalLocked(address(usdc)), 7000);
        assertEq(satStake.totalLocked(address(cirbtc)), 500);
        assertEq(usdc.balanceOf(address(satStake)), DONATION + LATER_DONATION + 7000);
        assertEq(cirbtc.balanceOf(address(satStake)), 500, "a donation of one token does not reach another");

        vm.startPrank(referee);
        satStake.markKept(kept);
        satStake.markBroken(broken);
        satStake.markKept(otherToken);
        vm.stopPrank();
        vm.warp(block.timestamp + 60);

        uint256 stakerBefore = usdc.balanceOf(staker);
        uint256 beneficiaryBefore = usdc.balanceOf(beneficiary);

        satStake.settle(kept);
        assertEq(usdc.balanceOf(staker), stakerBefore + 1000, "a kept stake returns exactly the stake");
        assertEq(satStake.totalLocked(address(usdc)), 6000);

        satStake.settle(broken);
        assertEq(usdc.balanceOf(beneficiary), beneficiaryBefore + 2000, "a broken stake pays exactly the stake");
        assertEq(satStake.totalLocked(address(usdc)), 4000);

        satStake.settle(expired);
        assertEq(usdc.balanceOf(beneficiary), beneficiaryBefore + 6000, "an expired stake pays exactly the stake");
        satStake.settle(otherToken);

        assertEq(satStake.totalLocked(address(usdc)), 0);
        assertEq(satStake.totalLocked(address(cirbtc)), 0);
        assertEq(usdc.balanceOf(staker), stakerBefore + 1000);
        assertEq(usdc.balanceOf(address(satStake)), DONATION + LATER_DONATION, "the donations stay in the contract");
        assertEq(cirbtc.balanceOf(address(satStake)), 0);
    }
}
