import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { key: "sessions", href: "/", label: "Sessions" },
  { key: "clients", href: "/clients", label: "Clients" },
  { key: "settings", href: "/settings", label: "Settings" },
] as const;

export type NavKey = (typeof NAV)[number]["key"];

export async function AppShell({ current, title, intro, actions, children }: { current: NavKey; title: string; intro?: string; actions?: React.ReactNode; children: React.ReactNode }) {
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
          <AccountMenu />
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
