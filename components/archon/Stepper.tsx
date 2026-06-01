import { Check, Loader2, X } from "lucide-react";
export type StepState = "completed" | "active" | "queued" | "failed";

export function Stepper({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.label} className="relative flex items-start gap-3 pb-5 last:pb-0">
            {/* Vertical connector that fills green once this step is completed. */}
            {!last ? (
              <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-border-subtle">
                <span
                  className={`block w-px origin-top bg-success transition-transform duration-500 ease-out ${s.state === "completed" ? "scale-y-100" : "scale-y-0"}`}
                  style={{ height: "100%" }}
                />
              </span>
            ) : null}
            <span
              className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border bg-surface-2 ${
                s.state === "active"
                  ? "border-green-400/50 ring-2 ring-green-400/20 motion-safe:animate-pulse"
                  : s.state === "completed"
                    ? "border-success/40"
                    : "border-border-subtle"
              }`}
            >
              {s.state === "completed" && <Check size={14} className="archon-pop text-success" />}
              {s.state === "active" && <Loader2 size={14} className="animate-spin text-green-400" />}
              {s.state === "failed" && <X size={14} className="text-danger" />}
              {s.state === "queued" && <span className="size-2 rounded-full bg-text-low" />}
            </span>
            <span className={`pt-1 transition-colors ${s.state === "queued" ? "text-text-low" : "text-text-hi"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
