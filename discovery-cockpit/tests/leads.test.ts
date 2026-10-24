/** Lead Finder preview: the CSV reader, the column mapping, the import, and who can see what. */
import { beforeAll, describe, expect, it } from "vitest";
import { DELETE as clearRoute } from "@/app/api/leads/route";
import { DELETE as removeRoute } from "@/app/api/leads/[id]/route";
import { POST as importRoute } from "@/app/api/leads/import/route";
import { PUT as settingsRoute } from "@/app/api/leads/settings/route";
import { CSV_LIMITS, CsvError, parseCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { mapColumns, mapLeads } from "@/lib/leads";
import { currentConsultant } from "@/server/auth";
import { getLeadSettings, importLeads, LeadError, listLeads, MAX_LEADS, updateLeadSettings } from "@/server/leads";
import { makeDemoSession } from "./helpers";

describe("the CSV reader", () => {
  it("reads plain rows, with LF, CRLF and a final line without a newline", () => {
    expect(parseCsv("a,b,c\n1,2,3\n4,5,6")).toEqual([["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]]);
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a,b\r1,2\r")).toEqual([["a", "b"], ["1", "2"]]); // old Mac line endings
  });
  it("reads quoted cells: commas, escaped quotes and line breaks inside quotes", () => {
    expect(parseCsv('name,notes\n"Lee, Jordan","said ""call me"""\n"Sam","line one\nline two"')).toEqual([["name", "notes"], ["Lee, Jordan", 'said "call me"'], ["Sam", "line one\nline two"]]);
  });
  it("keeps empty cells, including trailing ones and quoted empties", () => {
    expect(parseCsv("a,b,c\n1,,3\n,,\n4,5,")).toEqual([["a", "b", "c"], ["1", "", "3"], ["", "", ""], ["4", "5", ""]]);
    expect(parseCsv('a,b\n"",x')).toEqual([["a", "b"], ["", "x"]]);
  });
  it("skips blank lines and removes a byte-order mark", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n\n\n3,4\n")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
  it("treats a quote in the middle of a cell as an ordinary character", () => {
    expect(parseCsv('a,b\n5" pipe,x')).toEqual([["a", "b"], ['5" pipe', "x"]]);
  });
  it("refuses a quoted cell that never closes", () => {
    expect(() => parseCsv('a,b\n"unclosed,2')).toThrow(CsvError);
    expect(() => parseCsv('a\n"x""')).toThrow(/never closed/);
  });
  it("enforces its limits before doing the work", () => {
    expect(() => parseCsv("x".repeat(CSV_LIMITS.chars + 1))).toThrow(/too large/);
    expect(() => parseCsv(`a\n${"y".repeat(CSV_LIMITS.field + 1)}`)).toThrow(/cell is longer/);
    expect(() => parseCsv(Array.from({ length: CSV_LIMITS.columns + 1 }, (_, i) => `c${i}`).join(","))).toThrow(/more than 40 columns/);
    expect(() => parseCsv("a\n" + "x\n".repeat(CSV_LIMITS.rows + 5))).toThrow(/at most 5,000 rows/);
    expect(parseCsv("a\n" + "x\n".repeat(CSV_LIMITS.rows)).length).toBe(CSV_LIMITS.rows + 1); // exactly at the limit is fine
  });
});

describe("column mapping and validation", () => {
  it("recognises common header names, ignoring case, spaces, dashes and underscores", () => {
    expect(mapColumns(["Full Name", "Business-Name", "E-mail", "Phone_Number", "URL", "Industry", "City", "Lead Source", "Comments"])).toMatchObject({ name: 0, company: 1, phone: 3, website: 4, niche: 5, location: 6, source: 7, notes: 8 });
    expect(mapColumns(["EMAIL", "Contact"])).toMatchObject({ email: 0, name: 1 });
  });

  it("needs a header with a name, company or email column", () => {
    expect(() => mapLeads("foo,bar\n1,2")).toThrow(/header with at least a Name, Company or Email/);
    expect(mapLeads("").leads).toEqual([]);
  });

  it("maps a normal file and reports the columns it did not use", () => {
    const r = mapLeads("Name,Company,Email,Favourite colour\nJordan Lee,Example Ltd,Jordan@Example.com,blue");
    expect(r.ignored).toEqual(["Favourite colour"]);
    expect(r.leads).toHaveLength(1);
    expect(r.leads[0]).toMatchObject({ name: "Jordan Lee", company: "Example Ltd", email: "jordan@example.com", row: 2 }); // email lower-cased
  });

  it("uses the company or email as the name when a row has no name", () => {
    const r = mapLeads("Name,Company,Email\n,Example Ltd,\n,,only@example.com");
    expect(r.leads.map((l) => l.name)).toEqual(["Example Ltd", "only@example.com"]);
  });

  it("normalises websites and refuses anything that is not http(s)", () => {
    const r = mapLeads("Name,Website\nA,example.com\nB,https://example.org/x\nC,javascript:alert(1)\nD,ftp://example.com\nE,not a url at all");
    expect(r.leads.map((l) => [l.name, l.website])).toEqual([["A", "https://example.com/"], ["B", "https://example.org/x"]]);
    expect(r.skipped.map((k) => k.row)).toEqual([4, 5, 6]);
    expect(r.skipped.every((k) => /not a web address/.test(k.reason))).toBe(true);
  });

  it("skips invalid emails with the row number and the reason", () => {
    const r = mapLeads("Name,Email\nOk,ok@example.com\nBad,not-an-email\nWorse,a@b.co,evil@x.test");
    expect(r.leads.map((l) => l.name)).toEqual(["Ok", "Worse"]);
    expect(r.skipped).toEqual([{ row: 3, reason: "the email is not valid" }]);
  });

  it("drops rows that are completely blank and strips control characters", () => {
    const r = mapLeads("Name,Company\n,\nA\u0000B\u0007C,Co\n   ,   ");
    expect(r.leads.map((l) => l.name)).toEqual(["ABC"]);
    expect(r.skipped).toEqual([]);
  });

  it("limits field lengths", () => {
    const r = mapLeads(`Name,Notes\n${"x".repeat(121)},hi\nOk,${"n".repeat(1001)}`);
    expect(r.leads).toHaveLength(0);
    expect(r.skipped).toHaveLength(2);
  });

  it("keeps hostile text as plain text (it is escaped when shown, never interpreted)", () => {
    const r = mapLeads('Name,Company,Notes\n"<img src=x onerror=alert(1)>","=HYPERLINK(""http://evil.test"")","<script>1</script>"');
    expect(r.leads[0]).toMatchObject({ name: "<img src=x onerror=alert(1)>", company: '=HYPERLINK("http://evil.test")' });
  });

  it("counts rows the way a spreadsheet does: a cell with line breaks is still one row", () => {
    // Physical lines: 1 header, 2-3 the first record (its notes span two lines), 4 the second record.
    const r = mapLeads('Name,Email,Notes\nA,a@example.com,"two\nlines"\nB,nope,');
    expect(r.leads.map((l) => l.row)).toEqual([2]);
    expect(r.skipped).toEqual([{ row: 3, reason: "the email is not valid" }]); // row 3, although it sits on physical line 4
  });
});

// ---------------------------------------------------------------------------------------------

const send = (method: string, body?: unknown) => new Request("http://t/api", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

let owner: { id: string };
let other: { id: string };
beforeAll(async () => {
  owner = { id: (await makeDemoSession("leads-owner")).consultantId };
  other = { id: (await makeDemoSession("leads-other")).consultantId };
});
const on = (id: string) => updateLeadSettings(id, { enabled: true, niche: null, location: null, source: null });
const csv = "Name,Company,Email\nJordan Lee,Example Ltd,jordan@example.com\nSam Patel,Sample Dental,sam@example.org\n";
const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e) => e)) as LeadError | null)?.code ?? null;

describe("the preview is off until switched on", () => {
  it("starts off, with empty settings", async () => {
    const fresh = (await makeDemoSession("leads-fresh")).consultantId;
    expect(await getLeadSettings(fresh)).toEqual({ enabled: false, niche: "", location: "", source: "" });
  });
  it("refuses to import while off, and stores nothing", async () => {
    const fresh = (await makeDemoSession("leads-off")).consultantId;
    expect(await code(importLeads(fresh, csv))).toBe("CONFLICT");
    expect((await listLeads(fresh)).total).toBe(0);
  });
  it("keeps the intended inputs it was given", async () => {
    await updateLeadSettings(owner.id, { enabled: true, niche: "Dental clinics", location: "Mississauga", source: "Referrals" });
    expect(await getLeadSettings(owner.id)).toEqual({ enabled: true, niche: "Dental clinics", location: "Mississauga", source: "Referrals" });
  });
});

describe("importing", () => {
  it("imports rows, skips what is already there, and says how many of each", async () => {
    const c = (await makeDemoSession("leads-import")).consultantId;
    await on(c);
    const first = await importLeads(c, csv);
    expect(first).toMatchObject({ imported: 2, skippedCount: 0, ignoredColumns: [] });
    const again = await importLeads(c, `${csv}New Person,New Co,new@example.com\n`);
    expect(again.imported).toBe(1);
    expect(again.skippedCount).toBe(2);
    expect(again.skipped.map((s) => s.reason)).toEqual(["that email is already in your list", "that email is already in your list"]);
    expect((await listLeads(c)).total).toBe(3);
  });

  it("de-duplicates within one file, and by name+company when there is no email", async () => {
    const c = (await makeDemoSession("leads-dupes")).consultantId;
    await on(c);
    const r = await importLeads(c, "Name,Company,Email\nA,Co,a@example.com\nA2,Co2,A@EXAMPLE.COM\nNo Email,Same Co,\nno email,same co,\n");
    expect(r.imported).toBe(2);
    expect(r.skipped.map((s) => s.reason)).toEqual(["a duplicate of row 2 in this file", "a duplicate of row 4 in this file"]);
    const next = await importLeads(c, "Name,Company\nNO EMAIL,SAME CO\n");
    expect(next.skipped[0]!.reason).toBe("that name and company are already in your list");
  });

  it("refuses an empty file and a file without a usable header", async () => {
    await on(owner.id);
    expect(await code(importLeads(owner.id, ""))).toBe("INVALID");
    expect(await code(importLeads(owner.id, "Name,Email\n"))).toBe("INVALID"); // header only
    expect(await code(importLeads(owner.id, "foo,bar\n1,2"))).toBe("INVALID");
    expect(await code(importLeads(owner.id, 'Name\n"never closed'))).toBe("INVALID");
  });

  it("holds at most 5,000 leads per consultant, and a refused import changes nothing", async () => {
    const c = (await makeDemoSession("leads-cap")).consultantId;
    await on(c);
    await prisma.lead.createMany({ data: Array.from({ length: MAX_LEADS - 1 }, (_, i) => ({ consultantId: c, name: `Existing ${i}`, email: `e${i}@example.com` })) });
    const err = (await importLeads(c, "Name,Email\nOne,one@example.com\nTwo,two@example.com\n").catch((e) => e)) as LeadError;
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toMatch(/5,000/);
    expect((await listLeads(c)).total).toBe(MAX_LEADS - 1);
    await expect(importLeads(c, "Name,Email\nOne,one@example.com\n")).resolves.toMatchObject({ imported: 1 });
  }, 30_000);

  it("reports at most 50 skipped lines in detail but counts them all", async () => {
    const c = (await makeDemoSession("leads-many")).consultantId;
    await on(c);
    const bad = Array.from({ length: 80 }, (_, i) => `Bad${i},not-an-email`).join("\n");
    const r = await importLeads(c, `Name,Email\nGood,good@example.com\n${bad}\n`);
    expect(r.imported).toBe(1);
    expect(r.skippedCount).toBe(80);
    expect(r.skipped).toHaveLength(50);
    expect(r.skipped[0]!.row).toBe(3);
  });

  it("lists newest first and limits the page", async () => {
    const c = (await makeDemoSession("leads-list")).consultantId;
    await on(c);
    await importLeads(c, Array.from({ length: 5 }, (_, i) => `Person ${i},p${i}@example.com`).reduce((acc, row) => `${acc}${row}\n`, "Name,Email\n"));
    const page = await listLeads(c, 3);
    expect(page.total).toBe(5);
    expect(page.leads).toHaveLength(3);
  });
});

describe("routes", () => {
  it("in local mode they act on the one local consultant", async () => {
    const me = await currentConsultant();
    expect(me).toBeTruthy();
    expect((await settingsRoute(send("PUT", { enabled: true, niche: " Dental ", location: "", source: null }))).status).toBe(200);
    expect(await getLeadSettings(me!.id)).toMatchObject({ enabled: true, niche: "Dental", location: "", source: "" });
    const res = await importRoute(send("POST", { csv: "Name,Email\nRoute Lead,route-lead-1@example.com\n" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ imported: 1 });
  });

  it.each([
    ["settings with an unknown field", () => settingsRoute(send("PUT", { enabled: true, isAdmin: true }))],
    ["settings with a wrong type", () => settingsRoute(send("PUT", { enabled: "yes" }))],
    ["an import with a second field", () => importRoute(send("POST", { csv: "Name\nA", consultantId: "someone-else" }))],
    ["an import that is not text", () => importRoute(send("POST", { csv: 5 }))],
    ["an import over the size limit", () => importRoute(send("POST", { csv: "x".repeat(CSV_LIMITS.chars + 1) }))],
  ])("refuse %s", async (_n, call) => {
    expect((await call()).status).toBe(400);
  });

  it("maps a refused import to the right status", async () => {
    await settingsRoute(send("PUT", { enabled: true }));
    const bad = await importRoute(send("POST", { csv: "foo,bar\n1,2" }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/header/);
  });
});

describe("one consultant's leads are not another's", () => {
  it("lists, counts, deletes and clears only your own", async () => {
    await on(owner.id);
    await on(other.id);
    await importLeads(owner.id, "Name,Email\nMine One,mine1@example.com\nMine Two,mine2@example.com\n");
    await importLeads(other.id, "Name,Email\nTheirs,theirs@example.com\n");
    const mine = await listLeads(owner.id);
    const theirs = await listLeads(other.id);
    expect(mine.leads.map((l) => l.email)).not.toContain("theirs@example.com");
    expect(theirs.leads.map((l) => l.email)).toEqual(["theirs@example.com"]);

    // Deleting someone else's lead by id is "not found" and changes nothing.
    const { deleteLead, clearLeads } = await import("@/server/leads");
    expect(await code(deleteLead(owner.id, theirs.leads[0]!.id))).toBe("NOT_FOUND");
    expect((await listLeads(other.id)).total).toBe(1);
    // Clearing removes only your own.
    expect(await clearLeads(owner.id)).toBeGreaterThanOrEqual(2);
    expect((await listLeads(owner.id)).total).toBe(0);
    expect((await listLeads(other.id)).total).toBe(1);
  });

  it("the same email can be on two consultants' lists (each list is private)", async () => {
    await importLeads(owner.id, "Name,Email\nShared,shared-lead@example.com\n");
    await expect(importLeads(other.id, "Name,Email\nShared,shared-lead@example.com\n")).resolves.toMatchObject({ imported: 1 });
  });

  it("removing a lead by id through the route works for the owner", async () => {
    const mine = (await listLeads(owner.id)).leads[0]!;
    // In local mode the route acts on the oldest consultant, so make this lead theirs.
    const me = (await currentConsultant())!;
    await prisma.lead.update({ where: { id: mine.id }, data: { consultantId: me.id } });
    const res = await removeRoute(send("DELETE"), ctx({ id: mine.id }));
    expect(res.status).toBe(200);
    expect((await removeRoute(send("DELETE"), ctx({ id: mine.id }))).status).toBe(404);
    expect((await clearRoute(send("DELETE"))).status).toBe(200);
  });
});
