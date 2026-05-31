export function MainnetBadge() {
  return <div className="inline-flex items-center gap-2 rounded-pill border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs text-text-mid"><span className="relative flex size-2"><span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex size-2 rounded-full bg-success" /></span><span>Mantle Mainnet</span><span className="font-mono text-text-low">5000</span><span className="font-mono text-success">Live</span></div>;
}
