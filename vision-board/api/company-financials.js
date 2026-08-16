import { requestIsAuthed } from "../lib/auth.js";
import { TABLES, listRecords, getRecord } from "../lib/airtable.js";

export const config = { runtime: "edge" };

const BIZ_FIELD = { name: "Business", currentRevenue: "Current Monthly Revenue", targetRevenue: "Target Monthly Revenue" };
const FIN_FIELD = {
  month: "Month",
  business: "Business",
  income: "Income",
  expenses: "Expenses",
  notes: "Notes",
  traffic: "Traffic",
  leads: "Leads",
  offers: "Offers",
  sales: "Sales"
};
const SRC_FIELD = { source: "Source", business: "Business", month: "Month", traffic: "Traffic", leads: "Leads", offers: "Offers", sales: "Sales" };

function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function handler(request) {
  if (!(await requestIsAuthed(request, process.env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("businessId");
  if (!businessId) return json({ error: "businessId is required" }, 400);

  const [bizRecord, allEntries, allSources] = await Promise.all([
    getRecord(TABLES.projects, businessId),
    listRecords(TABLES.monthlyFinancials),
    listRecords(TABLES.leadSources)
  ]);
  if (!bizRecord) return json({ error: "Business not found" }, 404);

  const sources = allSources
    .filter((r) => r.fields[SRC_FIELD.business]?.[0] === businessId)
    .map((r) => ({
      id: r.id,
      source: r.fields[SRC_FIELD.source],
      month: r.fields[SRC_FIELD.month],
      traffic: r.fields[SRC_FIELD.traffic] || 0,
      leads: r.fields[SRC_FIELD.leads] || 0,
      offers: r.fields[SRC_FIELD.offers] || 0,
      sales: r.fields[SRC_FIELD.sales] || 0
    }));

  const entries = allEntries
    .filter((r) => r.fields[FIN_FIELD.business]?.[0] === businessId)
    .map((r) => ({
      id: r.id,
      month: r.fields[FIN_FIELD.month],
      income: r.fields[FIN_FIELD.income] || 0,
      expenses: r.fields[FIN_FIELD.expenses] || 0,
      notes: r.fields[FIN_FIELD.notes] || null,
      traffic: r.fields[FIN_FIELD.traffic] || 0,
      leads: r.fields[FIN_FIELD.leads] || 0,
      offers: r.fields[FIN_FIELD.offers] || 0,
      sales: r.fields[FIN_FIELD.sales] || 0
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthKey = shiftMonth(currentMonthKey, -1);
  const lastYearSameMonthKey = shiftMonth(currentMonthKey, -12);
  const currentYear = String(now.getFullYear());
  const lastYear = String(now.getFullYear() - 1);

  const byMonth = (key) => entries.find((e) => e.month === key) || null;
  const sumYear = (year) =>
    entries
      .filter((e) => e.month.startsWith(year))
      .reduce((acc, e) => ({ income: acc.income + e.income, expenses: acc.expenses + e.expenses }), { income: 0, expenses: 0 });

  return json({
    business: {
      id: bizRecord.id,
      name: bizRecord.fields[BIZ_FIELD.name] || "Untitled",
      currentRevenue: bizRecord.fields[BIZ_FIELD.currentRevenue] ?? null,
      targetRevenue: bizRecord.fields[BIZ_FIELD.targetRevenue] ?? null
    },
    currentMonthKey,
    entries,
    sources,
    thisMonth: byMonth(currentMonthKey),
    lastMonth: byMonth(lastMonthKey),
    lastYearSameMonth: byMonth(lastYearSameMonthKey),
    ytd: sumYear(currentYear),
    lastYearTotal: sumYear(lastYear)
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
