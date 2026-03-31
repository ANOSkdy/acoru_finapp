import type { ReactNode } from "react";

type StatusTone = "success" | "error" | "muted";

export default function StatusMessage({ tone = "muted", children }: { tone?: StatusTone; children: ReactNode }) {
  const className = tone === "success" ? "status-success" : tone === "error" ? "status-fail" : "record-meta";
  return <p className={className}>{children}</p>;
}
