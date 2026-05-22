// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deliberately flawed rewards distributor with an unbounded external-call loop.
contract GasGriefingRewards {
    address[] public recipients;
    mapping(address => uint256) public rewards;

    function addRecipient(address recipient, uint256 amount) external {
        require(recipient != address(0), "BAD_RECIPIENT");
        recipients.push(recipient);
        rewards[recipient] += amount;
    }

    function distribute() external {
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            uint256 amount = rewards[recipient];
            if (amount == 0) continue;

            rewards[recipient] = 0;
            (bool ok, ) = recipient.call{value: amount}("");
            require(ok, "PAYMENT_FAILED");
        }
    }

    receive() external payable {}
}
