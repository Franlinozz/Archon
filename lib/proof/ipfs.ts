import { canonicalize } from "./canonical";

export async function pinProofMetadata(metadata: unknown) {
  const body = canonicalize(metadata);
  const token = process.env.IPFS_PIN_TOKEN;
  const provider = process.env.IPFS_PIN_PROVIDER ?? "web3storage";
  if (!token) {
    return {
      uri: `data:application/json;base64,${Buffer.from(body).toString("base64")}`,
      pinned: false,
      provider,
      note: "IPFS_PIN_TOKEN is not configured; raw canonical metadata is stored in Postgres for verification.",
    };
  }
  if (provider === "web3storage") {
    const response = await fetch("https://api.web3.storage/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body,
    });
    if (!response.ok) throw new Error(`IPFS pin failed: ${response.status} ${await response.text()}`);
    const result = await response.json() as { cid?: string };
    if (!result.cid) throw new Error("IPFS pin response did not include a CID.");
    return { uri: `ipfs://${result.cid}`, pinned: true, provider, note: null };
  }
  if (provider === "pinata") {
    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ pinataContent: JSON.parse(body), pinataMetadata: { name: "archon-proof-metadata.json" } }),
    });
    if (!response.ok) throw new Error(`IPFS pin failed: ${response.status} ${await response.text()}`);
    const result = await response.json() as { IpfsHash?: string };
    if (!result.IpfsHash) throw new Error("Pinata pin response did not include an IpfsHash.");
    return { uri: `ipfs://${result.IpfsHash}`, pinned: true, provider, note: null };
  }
  throw new Error(`Unsupported IPFS_PIN_PROVIDER: ${provider}`);
}
