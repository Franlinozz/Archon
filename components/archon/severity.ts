export type Severity = "critical" | "high" | "medium" | "low" | "info";

export const severityStyles: Record<Severity, string> = {
  critical: "border-danger/30 bg-danger/15 text-danger",
  high: "border-high/30 bg-high/15 text-high",
  medium: "border-warning/30 bg-warning/15 text-warning",
  low: "border-success/30 bg-success/15 text-success",
  info: "border-info/30 bg-info/15 text-info",
};
