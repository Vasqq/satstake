// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test double for Circle's FiatToken (USDC) and for cirBTC: an ERC-20 whose issuer can
/// blocklist an address, so that transfers to or from it revert, and pause all transfers. These
/// issuer controls cannot be triggered on the real tokens, which is why SatStake is tested
/// against this mock (LLR-VV-007).
contract MockFiatToken is ERC20 {
    /// @notice A transfer involved `account`, which is on the blocklist.
    error Blocklisted(address account);

    /// @notice Transfers are paused.
    error TokenPaused();

    /// @notice Only the issuer may change the blocklist or the pause.
    error NotIssuer();

    /// @notice The deployer, who alone controls the blocklist and the pause.
    address public immutable issuer;

    bool public paused;
    mapping(address => bool) public isBlocklisted;

    uint8 private immutable _decimals;

    /// @param decimals_ 6 to stand in for USDC, 8 for cirBTC.
    constructor(uint8 decimals_) ERC20("Mock FiatToken", "MFT") {
        issuer = msg.sender;
        _decimals = decimals_;
    }

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Open to anyone, so tests and invariant handlers can fund any account directly.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function blocklist(address account) external onlyIssuer {
        isBlocklisted[account] = true;
    }

    function unBlocklist(address account) external onlyIssuer {
        isBlocklisted[account] = false;
    }

    function pause() external onlyIssuer {
        paused = true;
    }

    function unpause() external onlyIssuer {
        paused = false;
    }

    // FiatToken also refuses approvals while paused or when either party is blocklisted.
    function approve(address spender, uint256 value) public override returns (bool) {
        if (paused) revert TokenPaused();
        if (isBlocklisted[msg.sender]) revert Blocklisted(msg.sender);
        if (isBlocklisted[spender]) revert Blocklisted(spender);
        return super.approve(spender, value);
    }

    // Every balance change passes through `_update`, so one check here covers `transfer`,
    // `transferFrom`, and `mint`.
    function _update(address from, address to, uint256 value) internal override {
        if (paused) revert TokenPaused();
        if (isBlocklisted[from]) revert Blocklisted(from);
        if (isBlocklisted[to]) revert Blocklisted(to);
        super._update(from, to, value);
    }
}
