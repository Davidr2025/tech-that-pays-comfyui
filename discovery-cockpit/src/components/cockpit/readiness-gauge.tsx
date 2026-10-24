import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Readiness } from "@/lib/mock-ai/types";

const COLORS = { early: "#dc2626", warming: "#d97706", ready: "#16a34a" } as const;
const LABELS = { early: "Early", warming: "Warming up", ready: "Ready to move" } as const;
const ARC = "M 10 50 A 40 40 0 0 1 90 50";

export function ReadinessGauge({ readiness }: { readiness: Readiness }) {
  const color = COLORS[readiness.tier];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Decision Readiness
          <span className="text-xs font-medium" style={{ color }} data-testid="readiness-tier">
            {LABELS[readiness.tier]}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <svg viewBox="0 0 100 58" className="mx-auto w-48" role="img" aria-label={`Decision readiness ${readiness.score} out of 100`}>
          <path d={ARC} fill="none" stroke="#e5e7eb" strokeWidth="9" strokeLinecap="round" pathLength={100} />
          {readiness.score > 0 && (
            <path
              d={ARC}
              fill="none"
              stroke={color}
              strokeWidth="9"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${readiness.score} 100`}
              style={{ transition: "stroke-dasharray 400ms ease, stroke 400ms ease" }}
            />
          )}
          <text x="50" y="46" textAnchor="middle" fontSize="22" fontWeight="700" fill="currentColor" data-testid="readiness-score">
            {readiness.score}
          </text>
        </svg>
        <p className="mt-1 text-center text-sm text-muted-foreground" data-testid="readiness-reason">
          {readiness.reason}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {readiness.factors
            .filter((f) => f.points !== 0)
            .map((f) => (
              <span key={f.label} className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {f.label} {f.points > 0 ? "+" : ""}
                {f.points}
              </span>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
