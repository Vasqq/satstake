// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title SatStake
/// @notice Locks an allowlisted ERC-20 stake against a written promise. A named referee judges
/// the promise before its deadline; a kept promise returns the stake to the staker, and a broken
/// or unjudged one sends it to the named beneficiary.
/// @custom:trace LLR-SC-001 LLR-SC-004
contract SatStake {
    /// @notice Stored lifecycle of a pledge. `None` is the zero value, so an identifier that was
    /// never assigned reads as `None` and denotes a nonexistent pledge.
    /// @custom:trace LLR-SC-011
    enum Status {
        None,
        Active,
        Kept,
        Broken,
        SettledToStaker,
        SettledToBeneficiary
    }

    /// @notice State of a pledge as reported to readers. `Expired` is never stored: it is a stored
    /// `Active` pledge whose deadline has been reached.
    /// @custom:trace LLR-SC-011
    enum PledgeState {
        Active,
        Expired,
        Kept,
        Broken,
        SettledToStaker,
        SettledToBeneficiary
    }

    /// @notice One pledge: who staked what, who judges it, who receives a forfeited stake, when
    /// the verdict window closes, when it was created, its stored status, and the promise itself.
    /// @custom:trace LLR-SC-010
    struct Pledge {
        address staker;
        address token;
        uint256 amount;
        address referee;
        address beneficiary;
        uint64 deadline;
        uint64 createdAt;
        Status status;
        string promiseText;
    }

    /// @notice Shortest allowed time from creation to deadline, in seconds.
    /// @custom:trace LLR-SC-005
    uint64 public constant MIN_DURATION = 60;

    /// @notice Longest allowed time from creation to deadline, in seconds.
    /// @custom:trace LLR-SC-005
    uint64 public constant MAX_DURATION = 365 days;

    /// @notice Maximum length of a promise, in UTF-8 bytes.
    /// @custom:trace LLR-SC-005
    uint256 public constant MAX_PROMISE_BYTES = 280;

    /// @notice Maximum number of identifiers returned by one page of a pledge index.
    /// @custom:trace LLR-SC-005
    uint256 public constant MAX_PAGE = 100;

    /// @notice A token was added to the allowlist at construction.
    event TokenAllowed(address indexed token);

    /// @notice A pledge was created and its stake transferred into the contract.
    event PledgeCreated(
        uint256 indexed id,
        address indexed staker,
        address indexed token,
        uint256 amount,
        address referee,
        address beneficiary,
        uint64 deadline
    );

    /// @notice The referee judged a pledge: `kept` is true for kept, false for broken.
    event VerdictRecorded(uint256 indexed id, bool kept);

    /// @notice A pledge's stake was paid out in full to `recipient`.
    event PledgeSettled(uint256 indexed id, address indexed recipient, uint256 amount);

    /// @notice The constructor's token list is empty, too long, or has a zero, codeless, or
    /// repeated address.
    /// @custom:trace LLR-SC-004
    error InvalidAllowlist();

    /// @notice `token` is not on the allowlist.
    /// @custom:trace LLR-SC-004
    error TokenNotAllowed(address token);

    /// @notice The stake amount is zero.
    /// @custom:trace LLR-SC-004
    error ZeroAmount();

    /// @notice The referee or the beneficiary is the zero address.
    /// @custom:trace LLR-SC-004
    error ZeroAddress();

    /// @notice The referee or the beneficiary is this contract.
    /// @custom:trace LLR-SC-004
    error PartyIsContract();

    /// @notice The referee or the beneficiary is the staker.
    /// @custom:trace LLR-SC-004
    error PartyIsStaker();

    /// @notice The referee and the beneficiary are the same address.
    /// @custom:trace LLR-SC-004
    error RefereeIsBeneficiary();

    /// @notice The deadline is before `earliest`.
    /// @custom:trace LLR-SC-004
    error DeadlineTooSoon(uint64 earliest);

    /// @notice The deadline is after `latest`.
    /// @custom:trace LLR-SC-004
    error DeadlineTooFar(uint64 latest);

    /// @notice The promise text is empty.
    /// @custom:trace LLR-SC-004
    error PromiseEmpty();

    /// @notice The promise text is `length` bytes, more than `MAX_PROMISE_BYTES`.
    /// @custom:trace LLR-SC-004
    error PromiseTooLong(uint256 length);

    /// @notice The contract's token balance grew by `received` instead of `expected`.
    /// @custom:trace LLR-SC-004
    error UnexpectedTransferAmount(uint256 expected, uint256 received);

    /// @notice No pledge has identifier `id`.
    /// @custom:trace LLR-SC-004
    error PledgeNotFound(uint256 id);

    /// @notice The caller is not the pledge's referee.
    /// @custom:trace LLR-SC-004
    error NotReferee();

    /// @notice The pledge's stored status is `status`, not `Active`.
    /// @custom:trace LLR-SC-004
    error NotActive(Status status);

    /// @notice The verdict window closed at `deadline`.
    /// @custom:trace LLR-SC-004
    error VerdictWindowClosed(uint64 deadline);

    /// @notice The pledge has no verdict and its deadline, `deadline`, has not been reached.
    /// @custom:trace LLR-SC-004
    error NotSettleable(uint64 deadline);

    /// @notice The pledge has already been settled.
    /// @custom:trace LLR-SC-004
    error AlreadySettled();

    /// @param tokens The ERC-20 tokens pledges may use.
    constructor(address[] memory tokens) {}
}
