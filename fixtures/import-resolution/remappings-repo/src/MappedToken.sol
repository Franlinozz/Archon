// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@oz/contracts/token/ERC20/ERC20.sol";

contract MappedToken is ERC20 {
    constructor() ERC20("Mapped Token", "MAP") {
        _mint(msg.sender, 42 ether);
    }
}
