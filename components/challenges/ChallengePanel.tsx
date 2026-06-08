"use client";

import { useState } from "react";
import { ExternalLink, ShieldQuestion } from "lucide-react";

type Challenge = {
  id: string;
  targetType: string;
  challenger: string | null;
  title: string;
  rationale: string;
  evidenceUrl: string | null;
  status: string;
  challengeHash: string;
  referenceTxHash: string | null;
  referenceReportHash: string | null;
  createdAt: string;
};

export function ChallengePanel({ endpoint, targetType, targetId, initialChallenges }: { endpoint: string; targetType: "report" | "finding" | "gas-report" | "optimization"; targetId?: string; initialChallenges: Challenge[] }) {
  const [challenges, setChallenges] = useState(initialChallenges);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setError(null); setPending(true);
    const body = {
      targetType,
      findingId: targetType === "finding" ? targetId : undefined,
      optimizationId: targetType === "optimization" ? targetId : undefined,
      challenger: String(formData.get("challenger") ?? "").trim() || undefined,
      title: String(formData.get("title") ?? "").trim(),
      rationale: String(formData.get("rationale") ?? "").trim(),
      evidenceUrl: String(formData.get("evidenceUrl") ?? "").trim(),
    };
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.issues?.map((i: { message: string }) => i.message).join(" ") || payload.error || "Challenge failed.");
      setChallenges((current) => [payload.challenge, ...current]);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Challenge failed.");
    } finally {
      setPending(false);
    }
  }

  return <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs uppercase tracking-[0.14em] text-green-400">Public validation</p><h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-text-hi"><ShieldQuestion size={20}/> Challenge ledger</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-text-mid">Anyone can challenge this artifact. Archon records the challenge in the database with a deterministic hash and references any existing report proof tx/hash. No new validation contract is implied.</p></div>
      <button onClick={() => setOpen((v) => !v)} className="rounded-control border border-green-400/35 bg-green-400/10 px-3 py-2 text-sm font-semibold text-green-400">Challenge this {targetType.replace("-", " ")}</button>
    </div>
    {open ? <form action={submit} className="mt-4 grid gap-3 rounded-card border border-border-subtle bg-terminal p-4">
      <input name="challenger" placeholder="Name, wallet, or handle (optional)" className="rounded-control border-border-subtle bg-surface-1 text-sm text-text-hi" />
      <input name="title" required minLength={6} maxLength={160} placeholder="Short challenge title" className="rounded-control border-border-subtle bg-surface-1 text-sm text-text-hi" />
      <textarea name="rationale" required minLength={20} maxLength={4000} rows={5} placeholder="Explain what is wrong, incomplete, over-stated, or needs evidence…" className="rounded-control border-border-subtle bg-surface-1 text-sm text-text-hi" />
      <input name="evidenceUrl" placeholder="Evidence URL (optional)" className="rounded-control border-border-subtle bg-surface-1 text-sm text-text-hi" />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button disabled={pending} className="rounded-control bg-green-500 px-4 py-2 text-sm font-semibold text-on-green disabled:opacity-60">{pending ? "Recording…" : "Record challenge"}</button>
    </form> : null}
    <div className="mt-4 space-y-3">
      {challenges.map((challenge) => <article key={challenge.id} className="rounded-card border border-border-subtle bg-surface-2 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-text-hi">{challenge.title}</h3><p className="mt-1 text-xs text-text-low">{challenge.targetType} · {challenge.status} · {new Date(challenge.createdAt).toLocaleString()}</p></div><span className="rounded-pill border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">Challenge</span></div>
        <p className="mt-3 leading-6 text-text-mid">{challenge.rationale}</p>
        <div className="mt-3 grid gap-1 break-all font-mono text-xs text-text-low"><p>challengeHash: {challenge.challengeHash}</p>{challenge.referenceReportHash ? <p>referenceReportHash: {challenge.referenceReportHash}</p> : null}{challenge.referenceTxHash ? <p>referenceTxHash: {challenge.referenceTxHash}</p> : null}</div>
        {challenge.evidenceUrl ? <a href={challenge.evidenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-green-400">Evidence <ExternalLink size={13}/></a> : null}
      </article>)}
      {!challenges.length ? <p className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-low">No challenges recorded yet.</p> : null}
    </div>
  </section>;
}
