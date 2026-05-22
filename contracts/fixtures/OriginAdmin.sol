// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OriginAdmin {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function emergencyWithdraw() external {
        require(tx.origin == owner, "not owner");
        payable(msg.sender).transfer(address(this).balance);
    }
}
