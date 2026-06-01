"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Copy, ExternalLink, Plus, Settings } from "lucide-react";
import { copyText } from "@/components/archon/CopyButton";
import { MANTLE_CHAIN_ID, MANTLE_EXPLORER_URL } from "@/lib/chain/mantle";

const WORKSPACE_NAME = "Founder workspace";
const WORKSPACE_ID = "founder-workspace";

export function WorkspaceMenu({ agentId, identityRegistry }: { agentId: string; identityRegistry: string | null }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
  }, [open]);

  // Roving focus across enabled menu items.
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    if (!items.length) return;
    const idx = items.findIndex((el) => el === document.activeElement);
    const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const copyId = async () => {
    if (await copyText(WORKSPACE_ID)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const agentExplorerHref = identityRegistry ? `${MANTLE_EXPLORER_URL}/address/${identityRegistry}` : `${MANTLE_EXPLORER_URL}`;

  return (
    <div className="relative hidden sm:block">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if ((e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") && !open) { e.preventDefault(); setOpen(true); } }}
        className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-sm text-text-mid transition-colors hover:border-border-emphasis hover:text-ink"
      >
        <span className="grid size-5 place-items-center rounded-[6px] bg-brand-500 font-display text-xs text-on-brand">Α</span>
        <span className="max-w-[12ch] truncate">{WORKSPACE_NAME}</span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label="Workspace menu"
            onKeyDown={onMenuKeyDown}
            initial={reduce ? false : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "top left" }}
            className="absolute left-0 top-full z-50 mt-2 w-72 rounded-card border border-border-subtle bg-surface-3 p-2 shadow-lift"
          >
            {/* Header */}
            <div className="rounded-control bg-surface-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-text-hi">{WORKSPACE_NAME}</p>
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success"><span className="size-1.5 rounded-full bg-success" /> Mantle {MANTLE_CHAIN_ID} · Live</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-text-low">
                <span>Hackathon build</span>
                <span className="font-mono">Agent ID {agentId}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-2 space-y-0.5">
              <Link role="menuitem" href="/app/settings" onClick={() => close(false)} className="flex items-center gap-2.5 rounded-control px-3 py-2 text-sm text-body outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink">
                <Settings size={15} /> Workspace settings
              </Link>
              <button role="menuitem" onClick={copyId} className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm text-body outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink">
                {copied ? <Check size={15} className="archon-pop text-success" /> : <Copy size={15} />} {copied ? "Copied workspace ID" : "Copy workspace ID"}
              </button>
              <a role="menuitem" href={agentExplorerHref} target="_blank" rel="noreferrer" onClick={() => close(false)} className="flex items-center gap-2.5 rounded-control px-3 py-2 text-sm text-body outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink">
                <ExternalLink size={15} /> View Agent on Explorer
              </a>
            </div>

            {/* Disabled: single-workspace MVP */}
            <div className="mt-2 border-t border-border-subtle pt-2">
              <span aria-disabled className="flex cursor-not-allowed items-center gap-2.5 rounded-control px-3 py-2 text-sm text-text-low opacity-60">
                <Plus size={15} /> Create workspace · Coming soon
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
