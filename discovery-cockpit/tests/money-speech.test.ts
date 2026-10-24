/** Money as people actually say and type it: "four thousand dollars", "4,000 dollars", "four grand". */
import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/mock-ai/engine";
import { findMoney, wordsToNumber } from "@/lib/mock-ai/money";
import { buildRevealData } from "@/lib/reveal/build";

const amounts = (s: string) => findMoney(s).map((m) => [m.amount, m.period]);

describe("amounts people say", () => {
  it.each([
    ["We pay a contractor four thousand dollars a month.", 4000, "month"],
    ["We pay a contractor 4,000 dollars a month.", 4000, "month"],
    ["We pay a contractor 4000 dollars a month.", 4000, "month"],
    ["We pay a contractor four grand a month.", 4000, "month"],
    ["We pay a contractor 4k dollars a month.", 4000, "month"],
    ["We pay a contractor 4 thousand dollars a month.", 4000, "month"],
    ["It costs one hundred and twenty dollars a month.", 120, "month"],
    ["It costs a hundred dollars a month.", 100, "month"],
    ["It costs twelve hundred dollars a month.", 1200, "month"],
    ["It costs twenty five hundred dollars a month.", 2500, "month"],
    ["It's about four thousand five hundred dollars a month.", 4500, "month"],
    ["I set aside twenty five thousand dollars.", 25000, "unspecified"],
    ["I set aside twenty-five thousand dollars.", 25000, "unspecified"],
    ["We have fifteen hundred bucks a week in that.", 1500, "week"],
    ["Revenue is two million dollars a year.", 2_000_000, "year"],
    ["Revenue is 1.5 million dollars a year.", 1_500_000, "year"],
    ["One thousand two hundred and fifty dollars per month.", 1250, "month"],
    ["Ninety nine dollars a month for Zapier.", 99, "month"],
    ["It is about eight hundred dollars a month for HubSpot.", 800, "month"],
    ["We lose about 12,500 dollars a year.", 12500, "year"],
    ["That is 300 CAD per week.", 300, "week"],
    ["That is 75 USD a day.", 75, "day"],
    ["Five bucks an hour.", 5, "hour"],
    ["Four hundred thousand dollars a year in revenue.", 400_000, "year"],
    ["A thousand dollars a month.", 1000, "month"],
    ["Two grand a month.", 2000, "month"],
    ["Twenty five grand a year.", 25000, "year"],
  ])("%s -> $%d (%s)", (sentence, amount, period) => {
    expect(amounts(sentence)).toEqual([[amount, period]]);
  });

  it("still reads the dollar-sign forms exactly as before", () => {
    expect(amounts("We pay $4,000 a month and $48,000 a year, about $1.5 million overall.")).toEqual([[4000, "month"], [48000, "year"], [1_500_000, "unspecified"]]);
    expect(amounts("It's $95k a month.")).toEqual([[95000, "month"]]);
  });
});

describe("things that are NOT money stay not money", () => {
  it.each([
    ["no currency word: a bare number", "We make about fifteen thousand a year from that."],
    ["no currency word: digits and a scale", "We make 95 thousand a month."],
    ["a count of things", "We have ten thousand leads in the list."],
    ["a count of people", "Four thousand people signed up."],
    ["hours, not dollars", "It takes about four hundred hours a year."],
    ["'a grand total'", "That is a grand total of three tools."],
    ["'grand' as an adjective with a number elsewhere", "We had a grand opening with 200 guests."],
    ["a lone 'a grand'", "It was a grand idea."],
    ["a year", "We started in nineteen ninety nine."],
    ["an invalid grouping: nineteen ninety nine dollars", "It costs nineteen ninety nine dollars."],
    ["an invalid grouping: twenty twenty dollars", "It costs twenty twenty dollars."],
    ["an invalid grouping: two three dollars", "It costs two three dollars."],
    ["a repeated scale", "It costs thousand thousand dollars."],
    ["a bare scale with nothing before it", "It costs thousand dollars."],
    ["a bare 'hundred'", "It costs hundred dollars."],
    ["a million after a thousand", "It costs two thousand three million dollars."],
    ["no number at all", "Send me the dollars and the bucks."],
    ["a dollar sign with no number", "The $ symbol is missing."],
    ["'and' with nothing around it", "Pros and cons, dollars and cents."],
  ])("%s", (_name, sentence) => {
    expect(findMoney(sentence), sentence).toEqual([]);
  });

  it("only the money in a sentence that mixes counts and amounts", () => {
    expect(amounts("We have ten thousand leads and spend four thousand dollars a month on ads.")).toEqual([[4000, "month"]]);
  });
});

describe("positions stay exact (the period reader and tool-price pairing depend on them)", () => {
  it.each([
    ["We pay four thousand dollars a month on Upwork.", "four thousand dollars"],
    ["We pay 4,000 dollars a month on Upwork.", "4,000 dollars"],
    ["We pay four grand a month on Upwork.", "four grand"],
    ["We pay twenty-five hundred dollars a month.", "twenty-five hundred dollars"],
    ["We pay a hundred and twenty dollars a month.", "a hundred and twenty dollars"],
    ["We pay $4,000 a month.", "$4,000"],
  ])("%s", (sentence, expected) => {
    const [m] = findMoney(sentence);
    expect(sentence.slice(m!.start, m!.end).trim()).toBe(expected); // (the older $ pattern's match carries a trailing space)
  });

  it("returns matches in sentence order, without overlaps or doubles", () => {
    const s = "Asana is a hundred and twenty dollars a month, Zapier is $99 a month, and we pay 4,000 dollars to a freelancer.";
    const found = findMoney(s);
    expect(found.map((m) => m.amount)).toEqual([120, 99, 4000]);
    for (let i = 1; i < found.length; i++) expect(found[i]!.start).toBeGreaterThanOrEqual(found[i - 1]!.end);
  });

  it("counts '$4,000 dollars' once", () => {
    expect(findMoney("It was $4,000 dollars exactly.")).toHaveLength(1);
  });
});

describe("the number-word grammar", () => {
  it.each([
    [["four"], 4],
    [["twelve", "hundred"], 1200],
    [["one", "hundred", "and", "twenty"], 120],
    [["four", "thousand", "five", "hundred"], 4500],
    [["twenty", "five", "thousand"], 25000],
    [["a", "hundred"], 100],
    [["a", "thousand"], 1000],
    [["two", "million", "three", "hundred", "thousand"], 2_300_000],
    [["one", "thousand", "and", "fifty"], 1050],
  ])("%j = %d", (tokens, value) => {
    expect(wordsToNumber(tokens)).toBe(value);
  });

  it.each([
    [["nineteen", "ninety", "nine"]],
    [["twenty", "twenty"]],
    [["two", "three"]],
    [["hundred"]],
    [["thousand"]],
    [["thousand", "thousand"]],
    [["two", "thousand", "three", "million"]],
    [["a"]],
    [["a", "dollar"]],
    [["and", "four"]],
    [["four", "hundred", "hundred"]],
    [["twelve", "twenty"]],
    [["zero"]],
  ])("rejects %j", (tokens) => {
    expect(wordsToNumber(tokens)).toBeNull();
  });
});

describe("what it changes downstream", () => {
  const segs = (lines: string[]) => lines.map((text, order) => ({ speaker: "CLIENT" as const, text, order }));

  it("pairs spoken prices with the right tool, clause by clause", () => {
    const a = analyze(segs(["We use Asana at about one hundred and twenty dollars a month, and Zapier is ninety nine dollars a month, and HubSpot is eight hundred dollars a month."]), { type: "DISCOVERY" });
    const cost = (name: string) => a.tech.find((t) => t.tool === name)?.monthlyCost;
    expect(cost("Asana")).toBe(120);
    expect(cost("Zapier")).toBe(99);
    expect(cost("HubSpot")).toBe(800);
  });

  it("keeps a spoken dollar figure in the money the review lists, in its own words", () => {
    const a = analyze(segs(["We also pay a contractor four thousand dollars a month on Upwork to help with reporting."]), { type: "DISCOVERY" });
    expect(a.money.map((m) => [m.amount, m.period])).toEqual([[4000, "month"]]);
    const d = buildRevealData({
      consultant: { name: "Avery Quinn", businessName: "Quinn Studio", tagline: null },
      branding: { primaryColor: "#0f766e", accentColor: "#d97706", logoUrl: null },
      client: { name: "Priya", companyName: "Brightline" },
      analysis: a,
      generatedAt: new Date("2026-10-24T12:00:00Z"),
    });
    expect(d.moneyMentioned).toMatchObject([{ amount: 4000, period: "month" }]);
  });

  it("feeds the assessment's finance lines when revenue is spoken", () => {
    const a = analyze(segs(["Revenue is about ninety five thousand dollars a month.", "Payroll runs forty one thousand dollars a month."]), { type: "COMBINED_ASSESSMENT" });
    expect(a.assessment.finance).toMatchObject({ revenueMonthly: 95000, payrollMonthly: 41000 });
  });

  it("does not turn a count into a cost", () => {
    const a = analyze(segs(["We have ten thousand leads in HubSpot and we pay for it."]), { type: "DISCOVERY" });
    expect(a.money).toEqual([]);
  });
});
