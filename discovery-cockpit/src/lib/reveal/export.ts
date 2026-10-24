/**
 * Exports of the client review: plain text, inline-styled HTML (for pasting into Gamma or any
 * editor) and the content of a follow-up email.
 *
 * Every function takes ONLY the validated, allow-listed RevealData, so an export cannot carry a
 * private field the reveal itself cannot. The HTML is self-contained: inline styles only, no
 * <style>, <script>, images or external references, and every string is escaped.
 */
import { accentOnWhite } from "../brand";
import { readableTextColor } from "../color";
import { formatMoney, formatPeriod } from "../format";
import { REVIEW_LABEL } from "../session-types";
import type { RevealData } from "./schema";

const dateOf = (data: RevealData) =>
  new Date(data.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

const moneyLine = (m: RevealData["moneyMentioned"][number]) => `${formatMoney(m.amount)}${formatPeriod(m.period) ? ` ${formatPeriod(m.period)}` : ""}`;

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function revealToText(data: RevealData): string {
  const { header, totals } = data;
  const out: string[] = [`${header.businessName} — ${REVIEW_LABEL[data.kind]}`, `Prepared for ${header.clientName}, ${header.clientCompany} · ${dateOf(data)}`, ""];
  const section = (title: string, lines: string[]) => out.push(title.toUpperCase(), ...lines, "");

  section("What we heard", [data.summary, ...(data.timeline.deadline ? [`Target date: ${data.timeline.deadline}`] : []), ...(data.timeline.window ? [`Looking to move within: ${data.timeline.window}`] : [])]);
  if (data.painPoints.length) section("What's getting in the way", data.painPoints.map((p) => `- ${p.title}: ${p.detail}`));
  if (data.moneyMentioned.length) section("The numbers you mentioned", data.moneyMentioned.map((m) => `- ${moneyLine(m)} — “${m.context}”`));
  if (data.roi) {
    const t = data.roi.time;
    section("What this could be worth", [
      ...(t
        ? [
            ...t.sinks.map((s) => `- ${s.title}: ${s.hoursPerWeek} hours per week`),
            `You described: ${t.hoursPerYear.toLocaleString("en-US")} hours a year`,
            `Could be recovered (estimate): ${t.recoverableHoursPerYear.toLocaleString("en-US")} hours a year`,
            ...(t.recoverableValue !== null ? [`Worth about (estimate): ${formatMoney(t.recoverableValue)} a year`] : []),
          ]
        : []),
      ...data.roi.statedCosts.map((c) => `- ${c.title} (you said ${c.stated}): ${formatMoney(c.annualAmount)} a year`),
      ...data.roi.assumptions.map((a) => `* ${a}`),
    ]);
  }
  if (data.techStack.length) {
    section("Your current tools", [
      ...data.techStack.map((t) => `- ${t.tool} (${t.purpose}): ${t.monthlyCost === null ? "cost not stated" : `${formatMoney(t.monthlyCost)} per month, ${formatMoney(t.annualCost ?? t.monthlyCost * 12)} per year`}`),
      `Total: ${formatMoney(totals.monthly)} per month, ${formatMoney(totals.annual)} per year (${totals.toolsWithCost} of ${totals.toolsTotal} tools with a stated cost)`,
    ]);
  }
  if (data.currentState.length || data.futureState.length) {
    section("Where you are today vs. where you could be", ["Today:", ...data.currentState.map((s) => `- ${s}`), "", "Where we could get to:", ...data.futureState.map((s) => `- ${s}`)]);
  }
  if (data.nextSteps.length || data.booking) {
    section("Next steps", [...data.nextSteps.map((s, i) => `${i + 1}. ${s}`), ...(data.booking ? ["", `${data.booking.label}: ${data.booking.url}`] : [])]);
  }
  out.push(`Prepared by ${header.consultantName}, ${header.businessName} · ${dateOf(data)}`);
  return out.join("\n");
}

export function revealToHtml(data: RevealData): string {
  const { header, totals } = data;
  const brand = header.brandColor;
  const onBrand = readableTextColor(brand);
  const accent = accentOnWhite(header.accentColor, brand);
  const font = "font-family:Arial,Helvetica,sans-serif;color:#0f172a;";
  const h2 = (t: string) => `<h2 style="${font}font-size:18px;margin:28px 0 10px;padding-bottom:4px;border-bottom:2px solid ${brand};">${esc(t)}</h2>`;
  const p = (t: string, extra = "") => `<p style="${font}font-size:14px;line-height:1.55;margin:6px 0;${extra}">${esc(t)}</p>`;
  const ul = (items: string[]) => `<ul style="${font}font-size:14px;line-height:1.55;margin:6px 0;padding-left:22px;">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  const small = (t: string) => p(t, "font-size:12px;color:#64748b;");
  const th = (t: string, right = false) => `<th style="text-align:${right ? "right" : "left"};padding:6px 8px;border-bottom:1px solid #cbd5e1;font-size:12px;color:#64748b;">${esc(t)}</th>`;
  const td = (t: string, right = false) => `<td style="text-align:${right ? "right" : "left"};padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:14px;">${esc(t)}</td>`;

  const parts: string[] = [
    `<div style="${font}background:${brand};color:${onBrand};padding:20px 24px;border-radius:6px;">` +
      `<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:0.85;">${esc(REVIEW_LABEL[data.kind])}</div>` +
      `<div style="font-size:24px;font-weight:bold;margin-top:4px;">${esc(header.businessName)}</div>` +
      (header.tagline ? `<div style="font-size:14px;margin-top:2px;">${esc(header.tagline)}</div>` : "") +
      `<div style="font-size:14px;margin-top:14px;">Prepared for ${esc(header.clientName)}, ${esc(header.clientCompany)} · ${esc(dateOf(data))}</div></div>`,
    h2("What We Heard"),
    p(data.summary),
  ];
  if (data.timeline.deadline) parts.push(p(`Target date: ${data.timeline.deadline}`, `font-weight:bold;color:${accent};`));
  if (data.timeline.window) parts.push(p(`Looking to move within: ${data.timeline.window}`, `font-weight:bold;color:${accent};`));
  if (data.painPoints.length) {
    parts.push(h2("What's Getting in the Way"), ul(data.painPoints.map((x) => `<strong>${esc(x.title)}</strong> — ${esc(x.detail)}`)));
  }
  if (data.moneyMentioned.length) {
    parts.push(h2("The Numbers You Mentioned"), ul(data.moneyMentioned.map((m) => `<strong>${esc(moneyLine(m))}</strong> — “${esc(m.context)}”`)));
  }
  if (data.roi) {
    const t = data.roi.time;
    parts.push(h2("What This Could Be Worth"));
    if (t) {
      parts.push(
        ul(t.sinks.map((s) => `${esc(s.title)}: ${s.hoursPerWeek} hours per week`)),
        ul([
          `You described: <strong>${t.hoursPerYear.toLocaleString("en-US")} hours a year</strong>`,
          `Could be recovered (estimate): <strong>${t.recoverableHoursPerYear.toLocaleString("en-US")} hours a year</strong>`,
          ...(t.recoverableValue !== null ? [`Worth about (estimate): <strong>${esc(formatMoney(t.recoverableValue))} a year</strong>`] : []),
        ]),
      );
    }
    if (data.roi.statedCosts.length) {
      parts.push(p("Dollar figures you tied to these problems:", "font-weight:bold;"), ul(data.roi.statedCosts.map((c) => `${esc(c.title)} (you said ${esc(c.stated)}): <strong>${esc(formatMoney(c.annualAmount))} a year</strong>`)));
    }
    for (const a of data.roi.assumptions) parts.push(small(a));
  }
  if (data.techStack.length) {
    parts.push(
      h2("Your Current Tools"),
      `<table style="border-collapse:collapse;width:100%;"><thead><tr>${th("Tool")}${th("What it's for")}${th("Monthly", true)}${th("Annual", true)}</tr></thead><tbody>` +
        data.techStack.map((t) => `<tr>${td(t.tool)}${td(t.purpose)}${td(t.monthlyCost === null ? "Not stated" : formatMoney(t.monthlyCost), true)}${td(t.annualCost === null ? "—" : formatMoney(t.annualCost), true)}</tr>`).join("") +
        `<tr>${td("Total")}${td("")}${td(formatMoney(totals.monthly), true)}${td(formatMoney(totals.annual), true)}</tr></tbody></table>`,
      small(totals.toolsWithCost === totals.toolsTotal ? `Totals include all ${totals.toolsTotal} tools.` : `Totals include the ${totals.toolsWithCost} of ${totals.toolsTotal} tools with a stated cost.`),
    );
  }
  if (data.currentState.length || data.futureState.length) {
    parts.push(h2("Where You Are Today vs. Where You Could Be"), p("Today", "font-weight:bold;"), ul(data.currentState.map(esc)), p("Where we could get to", `font-weight:bold;color:${accent};`), ul(data.futureState.map(esc)));
  }
  if (data.nextSteps.length || data.booking) {
    parts.push(h2("Next Steps"));
    if (data.nextSteps.length) parts.push(`<ol style="${font}font-size:14px;line-height:1.55;margin:6px 0;padding-left:22px;">${data.nextSteps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`);
    if (data.booking) {
      parts.push(`<p style="${font}font-size:14px;margin:12px 0;"><a href="${esc(data.booking.url)}" style="color:${accent};font-weight:bold;">${esc(data.booking.label)}</a></p>`);
    }
  }
  parts.push(small(`Prepared by ${header.consultantName}, ${header.businessName} · ${dateOf(data)}`));
  return `<div style="max-width:760px;margin:0 auto;${font}">${parts.join("")}</div>`;
}

export interface EmailPart {
  text: string;
  /** May be dropped, last first, when the message is too long for a mailto: link. */
  droppable?: boolean;
}

export interface EmailContent {
  subject: string;
  parts: EmailPart[];
}

/** A short follow-up in the consultant's voice: themes, the headline estimate, next steps, the booking link. */
export function buildEmailContent(data: RevealData): EmailContent {
  const first = data.header.clientName.split(/\s+/)[0] ?? data.header.clientName;
  const what = data.kind === "DISCOVERY" ? "discovery conversation" : "assessment";
  const parts: EmailPart[] = [
    { text: `Hi ${first},` },
    { text: `Thank you for the time on our ${what}. Here is a short summary of what I heard.` },
  ];
  const pains = data.painPoints.slice(0, 4).map((x) => `- ${x.title}`);
  if (pains.length) parts.push({ text: `What is getting in the way:\n${pains.join("\n")}`, droppable: true });
  const t = data.roi?.time;
  if (t) {
    parts.push({
      text: `You described about ${t.hoursPerWeek} hours a week on this work. By my conservative estimate, around ${t.recoverableHoursPerYear.toLocaleString("en-US")} hours a year could be recovered. The assumptions are in the full review.`,
      droppable: true,
    });
  }
  if (data.nextSteps.length) parts.push({ text: `Next steps:\n${data.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}` });
  if (data.booking) parts.push({ text: `${data.booking.label}: ${data.booking.url}` });
  parts.push({ text: `${data.header.consultantName}\n${data.header.businessName}` });
  return { subject: `${REVIEW_LABEL[data.kind]} for ${data.header.clientCompany}`, parts };
}
