"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";

export function GenerateFindingTestButton({ reportId, findingId }: { reportId: string; findingId: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("Generate Test for This Finding");

  async function generate() {
    setStatus("loading");
    setMessage("Generating finding test…");
    try {
      const response = await fetch(`/api/reports/${reportId}/findings/${findingId}/test`, { method: "POST" });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Generation failed");
      setStatus("done");
      setMessage("Generated — see Generated Tests page");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Generation failed");
    }
  }

  return <button onClick={generate} disabled={status === "loading"} className={status === "done" ? "inline-flex items-center gap-2 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-sm text-success" : status === "error" ? "inline-flex items-center gap-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" : "inline-flex items-center gap-2 rounded-control border border-green-400/30 bg-green-400/10 px-3 py-2 text-sm text-green-400 hover:bg-green-400/15 disabled:cursor-wait disabled:opacity-70"}>
    <FlaskConical size={15}/>{message}
  </button>;
}
