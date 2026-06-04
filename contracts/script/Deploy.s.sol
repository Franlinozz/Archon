// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ArchonProofRegistry} from "../src/ArchonProofRegistry.sol";

contract Deploy is Script {
    function run() external returns (ArchonProofRegistry registry) {
        vm.startBroadcast();
        registry = new ArchonProofRegistry();
        vm.stopBroadcast();
        console2.log("ArchonProofRegistry deployed at:", address(registry));
    }
}
