// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPriceFeed {
    function latestAnswer() external view returns (int256);
    function latestTimestamp() external view returns (uint256);
}

/// @notice Deliberately flawed oracle consumer: stale prices and signed casts are not handled safely.
contract OracleConsumer {
    IPriceFeed public immutable feed;
    address public owner;

    constructor(address feed_) {
        require(feed_ != address(0), "BAD_FEED");
        feed = IPriceFeed(feed_);
        owner = msg.sender;
    }

    function quoteCollateral(uint256 collateralAmount) external view returns (uint256) {
        int256 answer = feed.latestAnswer();
        feed.latestTimestamp(); // timestamp is read but no freshness bound is enforced.
        return collateralAmount * uint256(answer) / 1e8;
    }

    function setOwner(address newOwner) external {
        require(msg.sender == owner, "ONLY_OWNER");
        owner = newOwner; // intentionally misses zero-address guard for demo findings.
    }
}
