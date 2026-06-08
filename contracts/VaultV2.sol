// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VaultV2
/// @notice Deliberately flawed demo vault for Archon scans. Do not deploy with value.
contract VaultV2 {
    mapping(address => uint256) public balances;
    address[] public depositors;
    uint256 public totalFeesCollected;

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event SwapExecuted(address indexed account, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    function deposit() external payable {
        require(msg.value > 0, "NO_VALUE");

        if (balances[msg.sender] == 0) {
            depositors.push(msg.sender);
        }

        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @dev Textbook reentrancy: external call happens before balance is updated.
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "INSUFFICIENT_BALANCE");

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "TRANSFER_FAILED");

        balances[msg.sender] -= amount;
        emit Withdrawn(msg.sender, amount);
    }

    /// @dev Missing slippage check: minAmountOut is accepted but ignored.
    function swapWithoutSlippageCheck(address tokenOut, uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut) {
        require(tokenOut != address(0), "BAD_TOKEN");
        require(amountIn > 0, "BAD_AMOUNT");
        require(balances[msg.sender] >= amountIn, "INSUFFICIENT_BALANCE");

        balances[msg.sender] -= amountIn;
        totalFeesCollected += amountIn / 100;

        // Pretend an external DEX returned this amount. minAmountOut is never enforced.
        amountOut = (amountIn * 97) / 100;
        minAmountOut;

        emit SwapExecuted(msg.sender, tokenOut, amountIn, amountOut);
    }

    /// @dev Gas-wasteful pattern: unbounded storage-array loop for a value that could be tracked incrementally.
    function totalDepositedSlow() external view returns (uint256 total) {
        for (uint256 i = 0; i < depositors.length; i++) {
            total += balances[depositors[i]];
        }
    }

    receive() external payable {
        balances[msg.sender] += msg.value;
    }
}

// Archon gas action smoke change — no runtime effect.
