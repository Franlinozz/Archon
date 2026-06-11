import Link from "next/link";
import { Reveal } from "@/components/motion";

// Final CTA — short, as briefed: the arc lands on two words.
export function FinalCta() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 text-center md:py-32">
      <Reveal>
        <h2 className="font-display text-5xl tracking-[-0.04em] text-ink md:text-7xl">Ship <span className="archon-gradient-word">verified</span>.</h2>
        <div className="mt-8">
          <Link href="/app/audit/new" className="inline-block rounded-control bg-green-400 px-6 py-3 text-sm font-semibold text-on-green transition-colors hover:bg-green-300">Start a scan</Link>
        </div>
      </Reveal>
    </section>
  );
}
