import Image from "next/image";
import Link from "next/link";

// The logo is the dependable "go home" affordance. Public shells link to "/",
// the app shell links to "/app" (dashboard home), per Session 2b. The mark is the
// founder's real asset, theme-swapped via .theme-* visibility (no JS flash).
export function ArchonLogo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  const label = href === "/app" ? "Archon — go to dashboard" : "Archon — go to home";
  return (
    <Link
      href={href}
      aria-label={label}
      className="group inline-flex items-center gap-2.5 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
    >
      <span className="relative block size-7 overflow-hidden rounded-[7px] transition-[filter] duration-150 group-hover:brightness-110">
        <Image src="/mark-light.png" alt="Archon" width={28} height={28} className="only-marble size-7 object-cover" priority />
        <Image src="/mark-dark.png" alt="" aria-hidden width={28} height={28} className="only-obsidian size-7 object-cover" priority />
      </span>
      {!compact && <span className="font-display text-xl tracking-[-0.04em] text-ink transition-colors group-hover:text-brand-600">ARCHON</span>}
    </Link>
  );
}
