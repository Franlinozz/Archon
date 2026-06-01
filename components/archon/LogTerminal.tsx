"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

type LogLine = { id?: string; createdAt?: string; level: string; message: string };

export function LogTerminal({ lines }: { lines?: LogLine[] }) {
  const reduce = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fallback = [
    { id: "fallback-1", createdAt: new Date().toISOString(), level: "INFO", message: "Waiting for scan events…" },
  ];
  const entries = lines?.length ? lines : fallback;
  const count = entries.length;

  // Auto-scroll to the newest line as the log streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  // The Live Log is a deliberately dark island even in Marble. Scoping it to
  // theme-obsidian keeps its surface dark AND its text light-on-dark, instead of
  // inheriting Marble's dark-text tokens onto a dark surface (unreadable).
  return <section className="theme-obsidian rounded-card border border-border-subtle bg-terminal p-4 font-mono text-xs text-text-hi">
    <div className="mb-3 flex items-center justify-between text-text-low"><span>Live log</span><span className="rounded-pill border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">Full log · Coming soon</span></div>
    <div ref={scrollRef} className="max-h-72 space-y-2 overflow-auto pr-1">
      {entries.map((line, index) => {
        const time = line.createdAt ? new Date(line.createdAt).toLocaleTimeString([], { hour12: false }) : "--:--:--";
        const level = line.level.toUpperCase();
        return <motion.div
          key={line.id ?? `${line.createdAt}-${index}`}
          initial={reduce ? false : { opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="text-text-low">{time}</span> <span className={level === "ERROR" ? "text-danger" : level === "WARN" ? "text-warning" : "text-info"}>{level}</span> <span className="text-text-code">{line.message}</span>
        </motion.div>;
      })}
    </div>
  </section>;
}
