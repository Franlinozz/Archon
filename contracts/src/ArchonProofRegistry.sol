// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArchonProofRegistry
/// @notice Anchors verifiable proofs of Archon AI audit reports on Mantle Mainnet.
///         Each entry records the deterministic report hash, an IPFS metadata URI,
///         and the AI-derived risk score. Calling `logAuditProof` is the on-chain
///         step that publishes Archon's off-chain AI inference result so anyone can
///         independently re-check it. Risk intelligence, not a guarantee.
contract ArchonProofRegistry {
    struct Proof {
        bytes32 reportHash;   // canonical Archon report hash
        string  metadataURI;  // ipfs://... full report metadata
        uint8   riskScore;    // 0-100 AI-derived risk score
        address loggedBy;     // server agent wallet OR user wallet (self-custody)
        uint64  timestamp;    // block time of anchoring
        uint256 agentId;      // ERC-8004 Archon agent id (e.g. 97); 0 if n/a
    }

    mapping(bytes32 => Proof) private _proofs;
    bytes32[] private _allHashes;

    event AuditProofLogged(
        bytes32 indexed reportHash,
        address indexed loggedBy,
        uint256 indexed agentId,
        uint8   riskScore,
        string  metadataURI,
        uint64  timestamp
    );

    error ProofAlreadyExists(bytes32 reportHash);
    error EmptyReportHash();

    /// @notice Anchor a proof of an Archon audit report. Permissionless: anyone may
    ///         anchor their own report's proof. Idempotent per report hash.
    function logAuditProof(
        bytes32 reportHash,
        string calldata metadataURI,
        uint8 riskScore,
        uint256 agentId
    ) external {
        if (reportHash == bytes32(0)) revert EmptyReportHash();
        if (_proofs[reportHash].timestamp != 0) revert ProofAlreadyExists(reportHash);

        _proofs[reportHash] = Proof({
            reportHash: reportHash,
            metadataURI: metadataURI,
            riskScore: riskScore,
            loggedBy: msg.sender,
            timestamp: uint64(block.timestamp),
            agentId: agentId
        });
        _allHashes.push(reportHash);

        emit AuditProofLogged(
            reportHash, msg.sender, agentId, riskScore, metadataURI, uint64(block.timestamp)
        );
    }

    function getProof(bytes32 reportHash) external view returns (Proof memory) {
        return _proofs[reportHash];
    }

    function isAnchored(bytes32 reportHash) external view returns (bool) {
        return _proofs[reportHash].timestamp != 0;
    }

    function totalProofs() external view returns (uint256) {
        return _allHashes.length;
    }

    function proofHashAt(uint256 index) external view returns (bytes32) {
        return _allHashes[index];
    }
}
