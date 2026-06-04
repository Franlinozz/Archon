// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArchonProofRegistry} from "../src/ArchonProofRegistry.sol";

contract ArchonProofRegistryTest is Test {
    ArchonProofRegistry registry;
    bytes32 constant HASH = bytes32(uint256(0x3fad06e9));
    string constant URI = "ipfs://QmVqmvKfExample";

    event AuditProofLogged(
        bytes32 indexed reportHash,
        address indexed loggedBy,
        uint256 indexed agentId,
        uint8 riskScore,
        string metadataURI,
        uint64 timestamp
    );

    function setUp() public {
        registry = new ArchonProofRegistry();
    }

    function test_logsAndReadsBack() public {
        vm.expectEmit(true, true, true, true);
        emit AuditProofLogged(HASH, address(this), 97, 96, URI, uint64(block.timestamp));
        registry.logAuditProof(HASH, URI, 96, 97);

        assertTrue(registry.isAnchored(HASH));
        ArchonProofRegistry.Proof memory p = registry.getProof(HASH);
        assertEq(p.reportHash, HASH);
        assertEq(p.metadataURI, URI);
        assertEq(p.riskScore, 96);
        assertEq(p.agentId, 97);
        assertEq(p.loggedBy, address(this));
        assertEq(p.timestamp, uint64(block.timestamp));
    }

    function test_totalProofsIncrements() public {
        assertEq(registry.totalProofs(), 0);
        registry.logAuditProof(HASH, URI, 96, 97);
        assertEq(registry.totalProofs(), 1);
        registry.logAuditProof(bytes32(uint256(0xbeef)), URI, 10, 97);
        assertEq(registry.totalProofs(), 2);
        assertEq(registry.proofHashAt(0), HASH);
        assertEq(registry.proofHashAt(1), bytes32(uint256(0xbeef)));
    }

    function test_duplicateReverts() public {
        registry.logAuditProof(HASH, URI, 96, 97);
        vm.expectRevert(abi.encodeWithSelector(ArchonProofRegistry.ProofAlreadyExists.selector, HASH));
        registry.logAuditProof(HASH, URI, 96, 97);
    }

    function test_emptyHashReverts() public {
        vm.expectRevert(ArchonProofRegistry.EmptyReportHash.selector);
        registry.logAuditProof(bytes32(0), URI, 96, 97);
    }

    function test_isAnchoredFalseForUnknown() public view {
        assertFalse(registry.isAnchored(bytes32(uint256(0xdead))));
    }

    function test_anyWalletCanSelfAnchor() public {
        // permissionless: a different sender (the "self-custody" user) can anchor.
        address user = address(0xBd88);
        vm.prank(user);
        registry.logAuditProof(HASH, URI, 96, 97);
        assertEq(registry.getProof(HASH).loggedBy, user);
    }
}
