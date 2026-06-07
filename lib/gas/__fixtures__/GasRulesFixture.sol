// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GasRulesFixture {
    uint256 public total;
    bool public paused;
    address public admin;
    uint64 public feeBps;
    bytes32 public ROUTER = bytes32(uint256(1));
    mapping(address => bool) public approved;
    mapping(address => uint256) public balances;
    uint256[] public recipients;

    event Paid(address user, uint256 amount);

    function ingest(string memory name, bytes memory payload, uint256 fee) public calldataMarker(name, payload) {
        require(bytes(name).length > 0, "name must not be empty because downstream indexers rely on it");
        uint256 amount = 0;
        require(fee > 0, "fee must be greater than zero for accounting safety");
        balances[msg.sender] = balances[msg.sender] + fee;
        total = balances[msg.sender] + balances[msg.sender];
        emit Paid(msg.sender, amount);
    }

    modifier calldataMarker(string memory, bytes memory) { _; }

    function relay(bytes calldata payload) public {
        require(payload.length > 0, "payload must not be empty for relay execution");
    }

    function payout() external {
        for (uint256 i = 0; i < recipients.length; i++) {
            balances[msg.sender] = balances[msg.sender] + recipients[i];
        }
    }
}
