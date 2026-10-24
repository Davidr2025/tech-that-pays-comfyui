"use client";

import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";

export interface QuestionRow {
  id: string;
  topic: string;
  text: string;
  checked: boolean;
  /** Checked because the engine detected the topic, not because the consultant ticked it. */
  byAI: boolean;
}

export function QuestionPanel({ rows, onToggle }: { rows: QuestionRow[]; onToggle: (row: QuestionRow) => void }) {
  const covered = rows.filter((r) => r.checked).length;
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Discovery questions</CardTitle>
        <div className="pt-1">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span data-testid="question-progress">
              {covered} of {rows.length} covered
            </span>
            <span>{rows.length ? Math.round((covered / rows.length) * 100) : 0}%</span>
          </div>
          <Progress value={rows.length ? (covered / rows.length) * 100 : 0} aria-label="Questions covered" />
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.id} data-testid="question-row" data-topic={row.topic} data-checked={row.checked} data-ai={row.byAI}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 hover:bg-muted">
                <Checkbox className="mt-0.5" checked={row.checked} onCheckedChange={() => onToggle(row)} aria-label={row.text} />
                <span className="flex-1 text-sm leading-snug">
                  <span className={row.checked ? "text-muted-foreground line-through decoration-muted-foreground/40" : undefined}>{row.text}</span>
                  {row.byAI && (
                    <Badge variant="ai" className="ml-2 align-middle" data-testid="ai-badge">
                      <Bot className="mr-1 size-3" /> AI-detected
                    </Badge>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
