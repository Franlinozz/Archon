// Exercises the full server SIWE path with a synthetic viem signer (no real
// wallet): nonce -> sign EIP-4361 -> verify (cookie) -> session -> logout.
// Run against a live server: BASE=http://127.0.0.1:3000 npx tsx scripts/test-siwe.ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildSiweMessage } from "../lib/auth/siwe";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const CHAIN_ID = 5000;

function getCookie(res: Response): string | null {
  const sc = res.headers.get("set-cookie");
  if (!sc) return null;
  return sc.split(";")[0] ?? null; // "archon_siwe=...."
}

async function main() {
  const account = privateKeyToAccount(generatePrivateKey());
  const results: [string, boolean][] = [];
  const ok = (name: string, cond: boolean) => results.push([name, cond]);

  // 1. nonce
  const nonceRes = await fetch(`${BASE}/api/auth/nonce`);
  const { nonce } = await nonceRes.json();
  ok("nonce issued", typeof nonce === "string" && nonce.length >= 16);

  // 2. build + sign SIWE message
  const message = buildSiweMessage({
    domain: "archonaudit.xyz",
    address: account.address,
    uri: "https://archonaudit.xyz",
    chainId: CHAIN_ID,
    nonce,
    issuedAt: new Date().toISOString(),
  });
  const signature = await account.signMessage({ message });

  // 3. verify -> sets cookie
  const verifyRes = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  const verifyData = await verifyRes.json();
  ok("verify 200", verifyRes.ok);
  ok("verify returns lowercased address", verifyData.address === account.address.toLowerCase());
  const cookie = getCookie(verifyRes);
  ok("session cookie set", !!cookie && cookie.startsWith("archon_siwe="));

  // 4. session reflects address with the cookie
  const sessRes = await fetch(`${BASE}/api/auth/session`, { headers: cookie ? { cookie } : {} });
  const sessData = await sessRes.json();
  ok("session hydrates address", sessData.address === account.address.toLowerCase());

  // 5. replay the same nonce -> must fail (one-time)
  const replay = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  ok("nonce replay rejected", !replay.ok);

  // 6. tampered signature -> reject (fresh nonce)
  const { nonce: nonce2 } = await (await fetch(`${BASE}/api/auth/nonce`)).json();
  const msg2 = buildSiweMessage({ domain: "archonaudit.xyz", address: account.address, uri: "https://archonaudit.xyz", chainId: CHAIN_ID, nonce: nonce2, issuedAt: new Date().toISOString() });
  const badRes = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: msg2, signature }), // signature is for the old message
  });
  ok("wrong signature rejected", !badRes.ok);

  // 7. logout clears
  const logoutRes = await fetch(`${BASE}/api/auth/logout`, { method: "POST" });
  ok("logout 200", logoutRes.ok);

  let pass = 0;
  for (const [name, cond] of results) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (cond) pass++; }
  console.log(`\n${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
