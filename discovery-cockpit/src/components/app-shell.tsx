import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type SessionStatus } from "@/lib/sessions";
import { cn } from "@/lib/utils";

const NAV = [
  { key: "sessions", href: "/", label: "Sessions" },
  { key: "clients", href: "/clients", label: "Clients" },
  { key: "settings", href: "/settings", label: "Settings" },
] as const;

export type NavKey = (typeof NAV)[number]["key"];

export function AppShell({ current, title, intro, actions, children }: { current: NavKey; title: string; intro?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">
            Discovery Cockpit
          </Link>
          <nav aria-label="Main" className="flex gap-1">
            {NAV.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                aria-current={n.key === current ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 text-sm", n.key === current ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted")}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {intro && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{intro}</p>}
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}

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
