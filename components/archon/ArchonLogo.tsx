import Image from "next/image";
import Link from "next/link";

// The brand logo always links to the landing page "/" — everywhere it appears,
// dashboard included (Session 12 supersedes the earlier app→/app default). The
// "go to workspace" affordance is the Overview sidebar item, not the brand mark.
// Both the mark AND the "ARCHON" wordmark are the founder's real artwork
// (extracted from the committed logo, transparent), theme-swapped via .theme-*.
export function ArchonLogo({ href = "/", compact = false, size = "default" }: { href?: string; compact?: boolean; size?: "default" | "app" }) {
  const markClass = size === "app" ? "h-6" : "h-8";
  const wordmarkClass = size === "app" ? "h-2.5" : "h-3.5";
  return (
    <Link
      href={href}
      aria-label="Archon — go to landing page"
      className="group inline-flex items-center gap-2.5 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
    >
      <span className="relative flex items-center transition-[filter,transform] duration-150 group-hover:brightness-110 group-hover:drop-shadow-[0_0_10px_var(--ring)]">
        <Image src="/mark-light-cut.png" alt="Archon" width={474} height={611} className={`only-marble ${markClass} w-auto object-contain`} priority />
        <Image src="/mark-dark-cut.png" alt="" aria-hidden width={462} height={590} className={`only-obsidian ${markClass} w-auto object-contain`} priority />
      </span>
      {!compact && (
        <span className="relative flex items-center transition-[filter] duration-150 group-hover:brightness-110">
          <Image src="/wordmark-light.png" alt="Archon" width={662} height={60} className={`only-marble ${wordmarkClass} w-auto object-contain`} priority />
          <Image src="/wordmark-dark.png" alt="" aria-hidden width={662} height={66} className={`only-obsidian ${wordmarkClass} w-auto object-contain`} priority />
        </span>
      )}
    </Link>
  );
}
