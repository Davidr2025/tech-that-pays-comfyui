import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type SessionStatus } from "@/lib/sessions";

const STATUS_VARIANT = { SETUP: "low", LIVE: "high", REVIEW: "medium", REVEALED: "default", COMPLETED: "secondary" } as const;

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} data-testid="status-badge" data-status={status}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
