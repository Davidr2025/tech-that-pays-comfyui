"use client";

import { Download, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Field } from "@/components/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CSV_LIMITS } from "@/lib/csv";
import type { ImportResult, LeadSettings } from "@/server/leads";

interface Row {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  niche: string | null;
  location: string | null;
  source: string | null;
}

const SAMPLE = "name,company,email,phone,website,niche,location,source,notes\nJordan Lee,Example Plumbing Ltd,jordan@example.com,555-0100,example.com,Trades,Mississauga,Referral,Asked about invoicing\nSam Patel,Sample Dental,sam@example.org,,sample.example,Health,Toronto,Event,\n";

export function LeadFinderPanel({ settings, leads, total }: { settings: LeadSettings; leads: Row[]; total: number }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Saves go one at a time, newest last: overlapping requests could reach the server out of order and
  // let an older snapshot overwrite a newer one.
  const inFlight = useRef(false);
  const queued = useRef<LeadSettings | null>(null);

  async function save(next: LeadSettings) {
    setS(next);
    setMsg(null);
    if (inFlight.current) {
      queued.current = next; // only the latest matters
      return;
    }
    inFlight.current = true;
    let current: LeadSettings | null = next;
    while (current) {
      queued.current = null;
      const res = await fetch("/api/leads/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current) }).catch(() => null);
      const json = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      if (!res || !res.ok) setMsg({ ok: false, text: json?.error ?? "Could not save." });
      else if (!queued.current) {
        setMsg({ ok: true, text: "Saved." });
        router.refresh();
      }
      current = queued.current;
    }
    inFlight.current = false;
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setResult(null);
    if (file.size > CSV_LIMITS.chars) return setMsg({ ok: false, text: "That file is too large." });
    setCsv(await file.text());
    setFileName(file.name);
    setMsg(null);
  }

  async function importCsv() {
    setBusy(true);
    setMsg(null);
    setResult(null);
    try {
      const res = await fetch("/api/leads/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }) });
      const json = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) setMsg({ ok: false, text: json.error ?? "Could not import that file." });
      else {
        setResult(json);
        setCsv("");
        setFileName(null);
        if (fileInput.current) fileInput.current.value = "";
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
    }
    setBusy(false);
  }

  async function remove(url: string, method = "DELETE") {
    const res = await fetch(url, { method });
    if (res.ok) router.refresh();
    else setMsg({ ok: false, text: "Could not remove that." });
    setConfirmClear(false);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Lead Finder <Badge variant="medium">Coming soon</Badge> <Badge variant="outline">Preview, off by default</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The plan is to help you find people who look like your best clients. <strong>None of that exists yet.</strong> Nothing is searched, scraped or fetched, and no lead service is contacted. This preview only
            keeps a list you import yourself, so the shape of the feature can be tried.
          </p>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-1 size-4" checked={s.enabled} onChange={(e) => void save({ ...s, enabled: e.target.checked })} data-testid="lead-enabled" />
            <span>
              Turn on the preview
              <span className="block text-xs text-muted-foreground">Until you do, nothing can be imported.</span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-3" aria-label="Intended inputs">
            <Field label="Niche" hint="Who you want to find, e.g. owner-run dental clinics.">
              <Input id="lead-niche" value={s.niche} onChange={(e) => setS({ ...s, niche: e.target.value })} onBlur={() => void save(s)} maxLength={120} data-testid="lead-niche" />
            </Field>
            <Field label="Location" hint="Where, e.g. Mississauga and Brampton.">
              <Input id="lead-location" value={s.location} onChange={(e) => setS({ ...s, location: e.target.value })} onBlur={() => void save(s)} maxLength={120} data-testid="lead-location" />
            </Field>
            <Field label="Lead source" hint="Where leads would come from. Not connected yet.">
              <Input id="lead-source" value={s.source} onChange={(e) => setS({ ...s, source: e.target.value })} onBlur={() => void save(s)} maxLength={120} data-testid="lead-source" />
            </Field>
          </div>
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"} data-testid="lead-message">
              {msg.text}
            </p>
          )}
        </CardContent>
      </Card>

      {s.enabled && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Import a list</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                A CSV with a header row. We look for Name, Company, Email, Phone, Website, Niche, Location, Source and Notes (up to {CSV_LIMITS.rows.toLocaleString("en-US")} rows). Rows already in your list are skipped.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileInput} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => void chooseFile(e.target.files?.[0])} data-testid="lead-file" aria-label="Choose a CSV file" />
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                  <Upload /> Choose a CSV file
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`} download="sample-leads.csv" data-testid="lead-sample">
                    <Download /> Sample file
                  </a>
                </Button>
                {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
              </div>
              <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} placeholder="…or paste CSV text here" aria-label="CSV text" data-testid="lead-csv" />
              <Button type="button" onClick={() => void importCsv()} disabled={busy || !csv.trim()} data-testid="lead-import">
                {busy ? "Importing…" : "Import"}
              </Button>
              {result && (
                <div className="rounded-md border p-3 text-sm" data-testid="lead-result" role="status">
                  <p>
                    <strong>{result.imported}</strong> imported{result.skippedCount ? `, ${result.skippedCount} skipped` : ""}.
                  </p>
                  {result.ignoredColumns.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Columns not used: {result.ignoredColumns.join(", ")}.</p>}
                  {result.skipped.length > 0 && (
                    <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground" data-testid="lead-skipped">
                      {result.skipped.map((k) => (
                        <li key={k.row}>
                          Row {k.row}: {k.reason}
                        </li>
                      ))}
                      {result.skippedCount > result.skipped.length && <li>…and {result.skippedCount - result.skipped.length} more.</li>}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle data-testid="lead-count">Your list ({total.toLocaleString("en-US")})</CardTitle>
              {total > 0 &&
                (confirmClear ? (
                  <span className="flex items-center gap-2 text-sm">
                    Remove all {total.toLocaleString("en-US")}?
                    <Button size="sm" variant="destructive" onClick={() => void remove("/api/leads")} data-testid="lead-clear-confirm">
                      Yes
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>
                      No
                    </Button>
                  </span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setConfirmClear(true)} data-testid="lead-clear">
                    Clear list
                  </Button>
                ))}
            </CardHeader>
            <CardContent>
              {leads.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="lead-empty">
                  No leads yet. Import a CSV to see them here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] border-collapse text-sm" data-testid="lead-table">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        {["Name", "Company", "Email", "Phone", "Niche", "Location", "Source", ""].map((h) => (
                          <th key={h || "x"} className="py-2 pr-3 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((l) => (
                        <tr key={l.id} className="border-b" data-testid="lead-row">
                          <td className="py-2 pr-3 font-medium">{l.name}</td>
                          <td className="py-2 pr-3">{l.company}</td>
                          <td className="py-2 pr-3">{l.email}</td>
                          <td className="py-2 pr-3">{l.phone}</td>
                          <td className="py-2 pr-3">{l.niche}</td>
                          <td className="py-2 pr-3">{l.location}</td>
                          <td className="py-2 pr-3">{l.source}</td>
                          <td className="py-2 text-right">
                            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`Remove ${l.name}`} onClick={() => void remove(`/api/leads/${l.id}`)} data-testid="lead-remove">
                              <Trash2 />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {total > leads.length && <p className="mt-2 text-xs text-muted-foreground">Showing the newest {leads.length} of {total.toLocaleString("en-US")}.</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
