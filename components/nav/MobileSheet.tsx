"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArchonLogo } from "@/components/archon";

// Full-screen mobile navigation sheet shared by the public site and the app
// shell. Opaque canvas (readability over the dotted texture), scroll-locked,
// ESC/backdrop-free full takeover, transform/opacity motion only.
// Portaled to <body>: the site headers use backdrop-blur, and backdrop-filter
// turns an ancestor into the containing block for fixed descendants — without
// the portal this sheet would be trapped inside the 56px header box.
export function MobileSheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-canvas md:hidden"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <div className="sticky top-0 flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-canvas px-6">
            <ArchonLogo />
            <button
              type="button"
              onClick={onClose}
              autoFocus
              aria-label="Close menu"
              className="grid h-9 w-9 place-items-center rounded-control border border-border-subtle bg-surface-2 text-text-mid hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            >
              <X size={17} />
            </button>
          </div>
          <motion.div
            className="flex flex-1 flex-col px-6 py-6"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : 0.05 }}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
