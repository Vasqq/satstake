// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice An ERC-20 that is hostile on transfer: it can call back into another contract from
/// inside `transfer` and `transferFrom`, and it can report the transfer by returning `true`,
/// `false`, or nothing at all. It is the third mock required by LLR-VV-007: the reentrancy guard
/// and the safe-transfer wrapper cannot be shown to be applied against a well-behaved token.
contract MockHostileToken {
    /// @notice How the token reports a transfer.
    enum ReturnMode {
        True,
        False,
        Nothing
    }

    /// @notice The sender holds less than the amount sent.
    error InsufficientBalance();

    /// @notice The caller was approved for less than the amount sent.
    error InsufficientAllowance();

    string public constant name = "Mock Hostile Token";
    string public constant symbol = "MHOST";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    ReturnMode public returnMode;
    address public reentryTarget;
    bytes public reentryData;

    /// @notice The account whose whole balance the next transfer takes for the token itself.
    address public drainTarget;

    /// @notice How many times the token has called back into another contract.
    uint256 public reentryCount;

    function setReturnMode(ReturnMode mode) external {
        returnMode = mode;
    }

    /// @param target Called with `data` from inside the next transfer. The zero address disables it.
    function setReentry(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryData = data;
    }

    /// @param account Loses its whole balance to the token during the next transfer, so that a
    /// recipient's balance can fall across a transfer into it. The zero address disables it.
    function setDrain(address account) external {
        drainTarget = account;
    }

    /// @notice Open to anyone, so tests can fund any account directly.
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        if (returnMode != ReturnMode.False) _move(msg.sender, to, value);
        _afterTransfer();
        return _report();
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (returnMode != ReturnMode.False) {
            uint256 approved = allowance[from][msg.sender];
            if (approved < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = approved - value;
            _move(from, to, value);
        }
        _afterTransfer();
        return _report();
    }

    function _afterTransfer() private {
        _drain();
        _reenter();
    }

    function _drain() private {
        address target = drainTarget;
        if (target == address(0)) return;
        // Spent after one use, like the callback.
        drainTarget = address(0);
        _move(target, address(this), balanceOf[target]);
    }

    function _move(address from, address to, uint256 value) private {
        uint256 balance = balanceOf[from];
        if (balance < value) revert InsufficientBalance();
        balanceOf[from] = balance - value;
        balanceOf[to] += value;
    }

    function _reenter() private {
        address target = reentryTarget;
        if (target == address(0)) return;
        // Spent after one use, so the callback cannot recurse without end.
        reentryTarget = address(0);
        reentryCount++;
        (bool ok, bytes memory returndata) = target.call(reentryData);
        if (ok) return;
        // Bubbled rather than swallowed, so the caller sees why the reentrant call was refused.
        assembly ("memory-safe") {
            revert(add(returndata, 0x20), mload(returndata))
        }
    }

    function _report() private view returns (bool) {
        if (returnMode == ReturnMode.Nothing) {
            // Several deployed tokens, including USDT, return no value at all.
            assembly ("memory-safe") {
                return(0, 0)
            }
        }
        return returnMode == ReturnMode.True;
    }
}
