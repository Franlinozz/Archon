// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract NiftyDrop is ERC721, Ownable {
    uint256 public nextId;

    constructor() ERC721("NiftyDrop", "NFTD") Ownable(msg.sender) {}

    function mint(address to) external onlyOwner {
        _safeMint(to, ++nextId);
    }
}
