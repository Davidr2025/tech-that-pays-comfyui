const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** "$1,234" for whole-dollar amounts, "$1,234.56" otherwise. */
export function formatMoney(amount: number): string {
  return Number.isInteger(amount) ? usd0.format(amount) : usd2.format(amount);
}

const PERIOD_LABEL: Record<string, string> = {
  month: "per month",
  year: "per year",
  week: "per week",
  day: "per day",
  hour: "per hour",
  unspecified: "",
};

export function formatPeriod(period: string): string {
  return PERIOD_LABEL[period] ?? "";
}

/** ["a","b","c"] -> "a, b and c" */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
