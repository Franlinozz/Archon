import { erc8004Addresses } from "@/lib/chain/mantle";
import { SettingsClient } from "@/components/settings/SettingsClient";

export const dynamic = "force-dynamic";

// Server shell: reads server-only ERC-8004 env config and hands it to the
// interactive client surface. Every control there works or is explicitly disabled.
export default function SettingsPage() {
  const cfg = erc8004Addresses();
  return (
    <SettingsClient
      config={{
        agentId: cfg.agentIdentityRef?.split(":").at(-1) ?? "—",
        identityRegistry: cfg.identityRegistry ?? null,
        reputationRegistry: cfg.reputationRegistry ?? null,
        validationRegistry: cfg.validationRegistry ?? null,
      }}
    />
  );
}
