// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MantleSequencerSensitive {
    uint256 public deadline;

    function setDeadline(uint256 delay) external {
        deadline = block.timestamp + delay;
    }

    function settle() external view returns (bool) {
        return block.timestamp <= deadline;
    }
}
