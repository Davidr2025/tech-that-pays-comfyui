import { Lightbulb, MessageSquareQuote, ShieldAlert, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Analysis, NextQuestion } from "@/lib/mock-ai/types";

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function NextQuestionCard({ next }: { next: NextQuestion }) {
  return (
    <Card className="border-primary/40 bg-accent/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Lightbulb className="size-4 text-primary" /> Suggested next question
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-medium" data-testid="next-question">
          {next.text}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{next.why}</p>
      </CardContent>
    </Card>
  );
}

export function ReflectBackCard({ text }: { text: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <MessageSquareQuote className="size-4 text-primary" /> Reflect back
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed" data-testid="reflect-back">
          {text}
        </p>
      </CardContent>
    </Card>
  );
}

export function PainPointsCard({ painPoints }: { painPoints: Analysis["painPoints"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Pain points <span className="text-xs font-normal text-muted-foreground">{painPoints.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {painPoints.length === 0 ? (
          <Empty>None heard yet. Ask what the biggest frustration is.</Empty>
        ) : (
          <ul className="space-y-2.5" data-testid="pain-list">
            {painPoints.map((p) => (
              <li key={p.id} className="text-sm" data-severity={p.severity}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{p.title}</span>
                  <Badge variant={p.severity} className="shrink-0 capitalize">
                    {p.severity}
                  </Badge>
                </div>
                {p.impact && <p className="text-xs text-muted-foreground">Impact: {p.impact}</p>}
                <p className="mt-0.5 text-xs italic text-muted-foreground">“{p.quote}”</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function SignalsCard({ signals }: { signals: Analysis["signals"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Sparkles className="size-4 text-emerald-600" /> Buying signals
          <span className="ml-auto text-xs font-normal text-muted-foreground">{signals.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <Empty>None yet.</Empty>
        ) : (
          <ul className="space-y-2" data-testid="signal-list">
            {signals.map((s, i) => (
              <li key={i} className="text-sm">
                <Badge variant="secondary">{s.kind}</Badge>
                <p className="mt-0.5 text-xs italic text-muted-foreground">“{s.quote}”</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ObjectionsCard({ objections }: { objections: Analysis["objections"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <ShieldAlert className="size-4 text-amber-600" /> Objections
          <span className="ml-auto text-xs font-normal text-muted-foreground">{objections.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {objections.length === 0 ? (
          <Empty>None raised.</Empty>
        ) : (
          <ul className="space-y-2" data-testid="objection-list">
            {objections.map((o, i) => (
              <li key={i} className="text-sm">
                <Badge variant="medium">{o.kind}</Badge>
                <p className="mt-0.5 text-xs italic text-muted-foreground">“{o.quote}”</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
