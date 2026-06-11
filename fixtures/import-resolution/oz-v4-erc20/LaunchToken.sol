// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LaunchToken is ERC20 {
    constructor() ERC20("Launch Token", "LAUNCH") {
        _mint(msg.sender, 1_000_000 ether);
    }
}
