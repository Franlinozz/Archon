export function ArchonLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true" className="text-green-400">
        <path d="M7 27V15C7 9.48 11.48 5 17 5s10 4.48 10 10v12" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 27 17 10l6 17M13.5 20h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {!compact && <span className="font-display text-xl tracking-[-0.04em] text-text-hi">ARCHON</span>}
    </div>
  );
}
