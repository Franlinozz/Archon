import Link from "next/link";
import { Clock, Radio, ShieldCheck } from "lucide-react";

export default async function Page({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  return <div className="space-y-6">
    <div className="rounded-card border border-border-subtle bg-surface-1 p-6">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">Live Scan Progress</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-text-hi">Scan queued</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-text-mid">This placeholder confirms Audit Studio routing for Session 1 Part A. Session 2 replaces it with the live seven-stage pipeline view.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-card border border-border-subtle bg-surface-2 p-4"><Clock className="mb-3 text-green-400" size={18}/><p className="text-xs text-text-low">Status</p><p className="font-medium text-text-hi">Queued</p></div>
        <div className="rounded-card border border-border-subtle bg-surface-2 p-4"><Radio className="mb-3 text-info" size={18}/><p className="text-xs text-text-low">Scan ID</p><p className="break-all font-mono text-sm text-text-hi">{scanId}</p></div>
        <div className="rounded-card border border-border-subtle bg-surface-2 p-4"><ShieldCheck className="mb-3 text-success" size={18}/><p className="text-xs text-text-low">Network</p><p className="font-medium text-text-hi">Mantle Mainnet · Live</p></div>
      </div>
    </div>
    <Link href="/app/audit/new" className="inline-flex rounded-control border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-mid hover:text-green-400">Back to Audit Studio</Link>
  </div>;
}
