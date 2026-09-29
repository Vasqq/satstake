// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SatStake
/// @notice Locks an allowlisted ERC-20 stake against a written promise. A named referee judges
/// the promise before its deadline; a kept promise returns the stake to the staker, and a broken
/// or unjudged one sends it to the named beneficiary.
/// @custom:trace LLR-SC-001 LLR-SC-004 LLR-SC-014
contract SatStake is ReentrancyGuard {
    using SafeERC20 for IERC20;

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
    /// @custom:trace LLR-SC-013
    event TokenAllowed(address indexed token);

    /// @notice A pledge was created and its stake transferred into the contract.
    /// @custom:trace LLR-SC-029
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
    /// @custom:trace LLR-SC-033
    event VerdictRecorded(uint256 indexed id, bool kept);

    /// @notice A pledge's stake was paid out in full to `recipient`.
    /// @custom:trace LLR-SC-044
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

    // Written only by the constructor. The list keeps the constructor's order for `allowedTokens`;
    // the mapping answers membership without a loop.
    address[] private _allowedTokens;
    mapping(address => bool) private _isAllowed;

    // The identifier of the last pledge created, so the next one is this plus one.
    uint256 private _pledgeCount;

    mapping(uint256 => Pledge) private _pledges;

    // Stake held for each token, and the pledges each account takes part in. Both are kept as the
    // pledges change, so a reader never has to scan the whole history.
    mapping(address => uint256) private _totalLocked;
    mapping(address => uint256[]) private _pledgeIds;

    /// @param tokens The ERC-20 tokens pledges may use: 1 to 4 distinct contracts.
    /// @custom:trace LLR-SC-013
    constructor(address[] memory tokens) {
        if (tokens.length == 0 || tokens.length > 4) revert InvalidAllowlist(); // LLR-SC-013
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            // Checked apart from the code check, so the rule holds on a chain that puts code at
            // the zero address.
            if (token == address(0)) revert InvalidAllowlist(); // LLR-SC-013
            if (token.code.length == 0) revert InvalidAllowlist(); // LLR-SC-013
            if (_isAllowed[token]) revert InvalidAllowlist(); // LLR-SC-013
            _isAllowed[token] = true; // LLR-SC-013
            _allowedTokens.push(token); // LLR-SC-054
            emit TokenAllowed(token); // LLR-SC-013
        }
    }

    /// @notice Locks `amount` of `token` against `promiseText` until `deadline`, for `referee` to
    /// judge. A kept promise returns the stake to the caller; a broken or unjudged one sends it to
    /// `beneficiary`.
    /// @param token An allowlisted ERC-20.
    /// @param amount Stake, in the token's own units.
    /// @param referee The account that may record a verdict.
    /// @param beneficiary The account that receives a forfeited stake.
    /// @param deadline Unix time at which the verdict window closes.
    /// @param promiseText The promise, at most `MAX_PROMISE_BYTES` UTF-8 bytes.
    /// @return id The new pledge's identifier.
    /// @custom:trace LLR-SC-003 LLR-SC-010 LLR-SC-012 LLR-SC-020 LLR-SC-021 LLR-SC-022
    /// @custom:trace LLR-SC-023 LLR-SC-024 LLR-SC-025 LLR-SC-026 LLR-SC-027 LLR-SC-028 LLR-SC-029
    /// @custom:trace LLR-SC-045
    function createPledge(
        address token,
        uint256 amount,
        address referee,
        address beneficiary,
        uint64 deadline,
        string calldata promiseText
    ) external nonReentrant returns (uint256 id) {
        if (!_isAllowed[token]) revert TokenNotAllowed(token); // LLR-SC-021
        if (amount == 0) revert ZeroAmount(); // LLR-SC-022
        if (referee == address(0) || beneficiary == address(0)) revert ZeroAddress(); // LLR-SC-023
        if (referee == address(this) || beneficiary == address(this)) revert PartyIsContract(); // LLR-SC-023
        if (referee == msg.sender || beneficiary == msg.sender) revert PartyIsStaker(); // LLR-SC-023
        if (referee == beneficiary) revert RefereeIsBeneficiary(); // LLR-SC-024

        // Widened, so that a timestamp near the end of the uint64 range cannot overflow the bound.
        uint256 earliest = block.timestamp + MIN_DURATION;
        uint256 latest = block.timestamp + MAX_DURATION;
        if (deadline < earliest) revert DeadlineTooSoon(uint64(earliest)); // LLR-SC-025
        if (deadline > latest) revert DeadlineTooFar(uint64(latest)); // LLR-SC-025

        uint256 promiseLength = bytes(promiseText).length;
        if (promiseLength == 0) revert PromiseEmpty(); // LLR-SC-026
        if (promiseLength > MAX_PROMISE_BYTES) revert PromiseTooLong(promiseLength); // LLR-SC-026

        _receiveStake(token, amount);

        id = ++_pledgeCount; // LLR-SC-012

        Pledge storage p = _pledges[id]; // LLR-SC-010
        p.staker = msg.sender; // LLR-SC-020
        p.token = token; // LLR-SC-020
        p.amount = amount; // LLR-SC-020
        p.referee = referee; // LLR-SC-020
        p.beneficiary = beneficiary; // LLR-SC-020
        p.deadline = deadline; // LLR-SC-020
        p.createdAt = uint64(block.timestamp); // LLR-SC-020
        p.status = Status.Active; // LLR-SC-020
        p.promiseText = promiseText; // LLR-SC-020

        _totalLocked[token] += amount; // LLR-SC-028
        _pledgeIds[msg.sender].push(id); // LLR-SC-028
        _pledgeIds[referee].push(id); // LLR-SC-028
        _pledgeIds[beneficiary].push(id); // LLR-SC-028

        emit PledgeCreated(id, msg.sender, token, amount, referee, beneficiary, deadline); // LLR-SC-029
    }

    // Pulls the stake from the caller and confirms that exactly `amount` arrived. The balance is
    // measured around the transfer, because a token that took a fee would otherwise leave the
    // pledge promising more than the contract holds.
    function _receiveStake(address token, uint256 amount) private {
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount); // LLR-SC-003 LLR-SC-027 LLR-SC-045
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        // A token that took more than it delivered leaves no increase at all, which is reported as
        // nothing received so the check below raises the error the requirement names.
        uint256 received = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0; // LLR-SC-027
        if (received != amount) revert UnexpectedTransferAmount(amount, received); // LLR-SC-027
    }

    /// @notice Records the referee's verdict that the promise was kept, which sends the stake back
    /// to the staker at settlement. Only the pledge's referee may call it, only while the pledge is
    /// Active, and only before its deadline.
    /// @param id The pledge to judge.
    /// @custom:trace LLR-SC-003 LLR-SC-030 LLR-SC-031 LLR-SC-032 LLR-SC-033
    function markKept(uint256 id) external nonReentrant {
        _recordVerdict(id, true);
    }

    /// @notice Records the referee's verdict that the promise was broken, which sends the stake to
    /// the beneficiary at settlement. Only the pledge's referee may call it, only while the pledge
    /// is Active, and only before its deadline.
    /// @param id The pledge to judge.
    /// @custom:trace LLR-SC-003 LLR-SC-030 LLR-SC-031 LLR-SC-032 LLR-SC-033
    function markBroken(uint256 id) external nonReentrant {
        _recordVerdict(id, false);
    }

    // The two verdicts differ only in the status they store and the flag they report, so their
    // checks are written once and cannot drift apart.
    function _recordVerdict(uint256 id, bool kept) private {
        Pledge storage p = _pledges[id];
        if (p.status == Status.None) revert PledgeNotFound(id); // LLR-SC-030
        if (msg.sender != p.referee) revert NotReferee(); // LLR-SC-030
        if (p.status != Status.Active) revert NotActive(p.status); // LLR-SC-031
        if (block.timestamp >= p.deadline) revert VerdictWindowClosed(p.deadline); // LLR-SC-032
        p.status = kept ? Status.Kept : Status.Broken; // LLR-SC-033
        emit VerdictRecorded(id, kept); // LLR-SC-033
    }

    /// @notice Pays out a pledge's stake in full: to the staker if the referee judged the promise
    /// kept, and to the beneficiary if the referee judged it broken or the deadline passed with no
    /// verdict. Any account may call it.
    /// @param id The pledge to settle.
    /// @custom:trace LLR-SC-003 LLR-SC-040 LLR-SC-041 LLR-SC-042 LLR-SC-043 LLR-SC-044 LLR-SC-045
    function settle(uint256 id) external nonReentrant {
        Pledge storage p = _pledges[id];
        Status status = p.status;
        if (status == Status.None) revert PledgeNotFound(id); // LLR-SC-040
        if (status == Status.SettledToStaker || status == Status.SettledToBeneficiary) revert AlreadySettled(); // LLR-SC-042

        address recipient;
        Status settled;
        if (status == Status.Kept) {
            recipient = p.staker; // LLR-SC-041
            settled = Status.SettledToStaker; // LLR-SC-041
        } else if (status == Status.Broken) {
            recipient = p.beneficiary; // LLR-SC-041
            settled = Status.SettledToBeneficiary; // LLR-SC-041
        } else {
            // The only status left is Active, which settles once its deadline has been reached.
            if (block.timestamp < p.deadline) revert NotSettleable(p.deadline); // LLR-SC-042
            recipient = p.beneficiary; // LLR-SC-041
            settled = Status.SettledToBeneficiary; // LLR-SC-041
        }

        address token = p.token;
        uint256 amount = p.amount;
        p.status = settled; // LLR-SC-043
        _totalLocked[token] -= amount; // LLR-SC-043

        IERC20(token).safeTransfer(recipient, amount); // LLR-SC-003 LLR-SC-044 LLR-SC-045
        emit PledgeSettled(id, recipient, amount); // LLR-SC-044
    }

    /// @notice The stored record of pledge `id`, with the fields in the order declared above.
    /// @param id The pledge to read, from 1 to `pledgeCount()`.
    /// @custom:trace LLR-SC-050
    function getPledge(uint256 id) external view returns (Pledge memory) {
        if (id == 0 || id > _pledgeCount) revert PledgeNotFound(id); // LLR-SC-050
        return _pledges[id]; // LLR-SC-050
    }

    /// @notice The state of pledge `id` as readers see it. An Active pledge whose deadline has been
    /// reached reads as `Expired`, which no pledge ever stores; every other state is the stored one.
    /// @param id The pledge to read.
    /// @custom:trace LLR-SC-011 LLR-SC-051
    function stateOf(uint256 id) external view returns (PledgeState) {
        Pledge storage p = _pledges[id];
        Status status = p.status;
        if (status == Status.None) revert PledgeNotFound(id); // LLR-SC-051
        if (status == Status.Active) {
            if (block.timestamp >= p.deadline) return PledgeState.Expired; // LLR-SC-051
            return PledgeState.Active; // LLR-SC-051
        }
        if (status == Status.Kept) return PledgeState.Kept; // LLR-SC-051
        if (status == Status.Broken) return PledgeState.Broken; // LLR-SC-051
        if (status == Status.SettledToStaker) return PledgeState.SettledToStaker; // LLR-SC-051
        // The one status left is SettledToBeneficiary; the other five are answered above.
        return PledgeState.SettledToBeneficiary; // LLR-SC-051
    }

    /// @notice How many pledges have ever been created. The last identifier assigned is this value.
    /// @custom:trace LLR-SC-052
    function pledgeCount() external view returns (uint256) {
        return _pledgeCount; // LLR-SC-052
    }

    /// @notice How many pledges `account` takes part in, as staker, referee, or beneficiary.
    /// @custom:trace LLR-SC-053
    function pledgeCountOf(address account) external view returns (uint256) {
        return _pledgeIds[account].length; // LLR-SC-053
    }

    /// @notice One page of the identifiers `account` takes part in, in creation order.
    /// @param account The account whose index to read.
    /// @param offset How many identifiers to skip.
    /// @param limit How many to return at most, itself capped at `MAX_PAGE`.
    /// @return page The identifiers, fewer than asked for when the index ends first.
    /// @custom:trace LLR-SC-053
    function pledgeIdsOf(address account, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory page)
    {
        uint256[] storage ids = _pledgeIds[account];
        uint256 count = ids.length;
        if (offset >= count) return new uint256[](0); // LLR-SC-053

        uint256 size = limit > MAX_PAGE ? MAX_PAGE : limit; // LLR-SC-053
        uint256 remaining = count - offset;
        if (size > remaining) size = remaining; // LLR-SC-053

        page = new uint256[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = ids[offset + i]; // LLR-SC-053
        }
    }

    /// @notice The stake in `token` locked for pledges that have not been settled. The contract's
    /// balance can exceed this, since anyone may send it tokens outside a pledge.
    /// @custom:trace LLR-SC-055
    function totalLocked(address token) external view returns (uint256) {
        return _totalLocked[token]; // LLR-SC-055
    }

    /// @notice Whether pledges may use `token`.
    /// @custom:trace LLR-SC-054
    function isAllowedToken(address token) external view returns (bool) {
        return _isAllowed[token];
    }

    /// @notice The allowed tokens, in the order given at deployment.
    /// @custom:trace LLR-SC-054
    function allowedTokens() external view returns (address[] memory) {
        return _allowedTokens;
    }
}
