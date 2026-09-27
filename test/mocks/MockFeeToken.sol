// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice An ERC-20 that burns a fee from every transfer, so the recipient receives less than the
/// amount sent. It stands in for a fee a FiatToken upgrade could introduce, which the received-
/// amount check in `createPledge` must detect. It is the second mock required by LLR-VV-007.
contract MockFeeToken is ERC20 {
    /// @notice Fee on each transfer, in basis points of the amount sent.
    uint256 public immutable feeBps;

    constructor(uint256 feeBps_) ERC20("Mock Fee Token", "MFEE") {
        feeBps = feeBps_;
    }

    /// @notice Open to anyone, so tests can fund any account directly. Minting charges no fee.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        // Mints and burns have a zero side and are passed through unchanged.
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        // Rounded up, so every nonzero transfer pays at least one unit and small amounts cannot
        // slip past a received-amount check.
        uint256 fee = (value * feeBps + 9_999) / 10_000;
        super._update(from, address(0), fee);
        super._update(from, to, value - fee);
    }
}
