type LogLine = { id?: string; createdAt?: string; level: string; message: string };

export function LogTerminal({ lines }: { lines?: LogLine[] }) {
  const fallback = [
    { id: "fallback-1", createdAt: new Date().toISOString(), level: "INFO", message: "Waiting for scan events…" },
  ];
  const entries = lines?.length ? lines : fallback;
  return <section className="rounded-card border border-border-subtle bg-terminal p-4 font-mono text-xs">
    <div className="mb-3 flex items-center justify-between text-text-low"><span>Live log</span><span className="rounded-pill border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">Full log · Coming soon</span></div>
    <div className="max-h-72 space-y-2 overflow-auto pr-1">
      {entries.map((line, index) => {
        const time = line.createdAt ? new Date(line.createdAt).toLocaleTimeString([], { hour12: false }) : "--:--:--";
        const level = line.level.toUpperCase();
        return <div key={line.id ?? `${line.createdAt}-${index}`}>
          <span className="text-text-low">{time}</span> <span className={level === "ERROR" ? "text-danger" : level === "WARN" ? "text-warning" : "text-info"}>{level}</span> <span className="text-text-code">{line.message}</span>
        </div>;
      })}
    </div>
  </section>;
}
