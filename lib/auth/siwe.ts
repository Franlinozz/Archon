// EIP-4361 (Sign-In With Ethereum) message build/parse. Dependency-free and
// secret-free so the client can build the exact string the server verifies.

export const SIWE_STATEMENT =
  "Sign in to Archon. This is a free signature and does not authorize any transaction or spend.";

export type SiweFields = {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  statement?: string;
};

export function buildSiweMessage(f: SiweFields): string {
  const statement = f.statement ?? SIWE_STATEMENT;
  return [
    `${f.domain} wants you to sign in with your Ethereum account:`,
    f.address,
    "",
    statement,
    "",
    `URI: ${f.uri}`,
    "Version: 1",
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
  ].join("\n");
}

export type ParsedSiwe = { domain: string; address: string; uri: string; chainId: number; nonce: string; issuedAt: string };

export function parseSiweMessage(message: string): ParsedSiwe | null {
  const lines = message.split("\n");
  const domain = lines[0]?.replace(/ wants you to sign in.*$/, "").trim() ?? "";
  const address = lines[1]?.trim() ?? "";
  const field = (key: string) => message.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1]?.trim() ?? "";
  const uri = field("URI");
  const chainId = Number(field("Chain ID"));
  const nonce = field("Nonce");
  const issuedAt = field("Issued At");
  if (!domain || !/^0x[a-fA-F0-9]{40}$/.test(address) || !nonce || !Number.isFinite(chainId)) return null;
  return { domain, address, uri, chainId, nonce, issuedAt };
}
