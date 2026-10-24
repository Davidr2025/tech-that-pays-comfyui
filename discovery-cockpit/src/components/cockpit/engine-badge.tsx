import { Badge } from "@/components/ui/badge";
import type { Provenance } from "@/lib/ai/types";

/**
 * Which engine produced the coaching panel, shown to the consultant only (this component lives under the cockpit, which
 * the client never sees). It says plainly when Claude was chosen but the rule-based result is what is on screen.
 */
export function EngineBadge({ engine, error }: { engine: Provenance & { waiting: boolean }; error: string | null }) {
  const claude = engine.provider === "claude";
  const text = claude
    ? engine.waiting
      ? "Claude · updating…"
      : "Claude"
    : engine.fellBack
      ? engine.waiting
        ? "Rule-based · waiting for Claude…"
        : "Rule-based · Claude unavailable"
      : "Rule-based";
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="engine-badge" data-provider={engine.provider} data-fallback={engine.fellBack}>
      <Badge variant={claude ? "default" : "outline"} className="text-[11px]" title="Which engine produced this coaching panel. Only you see this.">
        Analysis: {text}
      </Badge>
      {error && engine.fellBack && (
        <span className="text-[11px] text-muted-foreground" role="status">
          {error}
        </span>
      )}
    </div>
  );
}
