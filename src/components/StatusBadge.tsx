import { cn } from "@/lib/utils";

type StatusType = "pending" | "submitted" | "approved" | "flagged" | "active" | "inactive" | "generating" | "ready" | "printed" | "error" | "matched" | "mismatched";

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-warning/10 text-warning border-warning/20" },
  submitted: { label: "Submitted", className: "bg-info/10 text-info border-info/20" },
  approved: { label: "Approved", className: "bg-success/10 text-success border-success/20" },
  flagged: { label: "Flagged", className: "bg-destructive/10 text-destructive border-destructive/20" },
  active: { label: "Active", className: "bg-success/10 text-success border-success/20" },
  inactive: { label: "Inactive", className: "bg-muted text-muted-foreground border-border" },
  generating: { label: "Generating", className: "bg-info/10 text-info border-info/20 animate-pulse" },
  ready: { label: "Ready", className: "bg-success/10 text-success border-success/20" },
  printed: { label: "Printed", className: "bg-muted text-muted-foreground border-border" },
  error: { label: "Error", className: "bg-destructive/10 text-destructive border-destructive/20" },
  matched: { label: "✅ Matched", className: "bg-success/10 text-success border-success/20" },
  mismatched: { label: "❌ Mismatch", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export function StatusBadge({ status, className }: { status: StatusType; className?: string }) {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors", config.className, className)}>
      {config.label}
    </span>
  );
}
