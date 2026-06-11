// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC20} from "solmate/tokens/ERC20.sol";

contract SolmateVault is ERC20 {
    constructor() ERC20("Solmate Vault Share", "SVS", 18) {}

    function deposit(uint256 amount) external {
        _mint(msg.sender, amount);
    }

    function withdraw(uint256 shares) external {
        _burn(msg.sender, shares);
    }
}
