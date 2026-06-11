"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { AppSidebarNav } from "@/components/nav/AppSidebarNav";
import { MobileSheet } from "@/components/nav/MobileSheet";

// App-shell mobile navigation: the full sidebar taxonomy as a sheet, so every
// workspace page is reachable at phone widths.
export function AppMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-control border border-border-subtle bg-surface-2 text-text-mid hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
      >
        <Menu size={16} />
      </button>
      <MobileSheet open={open} onClose={() => setOpen(false)} label="Workspace navigation">
        <AppSidebarNav variant="sheet" onNavigate={() => setOpen(false)} />
      </MobileSheet>
    </div>
  );
}
