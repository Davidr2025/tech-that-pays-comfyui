/**
 * Best-effort brand colour detection from a website's HTML and CSS. Pure functions: the fetching
 * lives in src/server/brand.ts. The result is a suggestion; the consultant can always override it.
 */

export interface BrandColors {
  primary: string;
  accent: string | null;
  /** Up to 6 candidate colours, strongest first, for the picker. */
  detected: string[];
}

const HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const RGB = /rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)/gi;

export function normalizeHex(value: string): string | null {
  const m = value.trim().toLowerCase().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!m) return null;
  const h = m[1]!;
  return `#${h.length === 3 ? h.split("").map((c) => c + c).join("") : h}`;
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue (0-360), saturation and lightness (0-1). */
export function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = toRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** White, black and greys are page furniture, not brand colours. */
export function isBrandable(hex: string): boolean {
  const { s, l } = hsl(hex);
  return l > 0.12 && l < 0.88 && s > 0.2;
}

function rgbToHex(r: number, g: number, b: number): string | null {
  if ([r, g, b].some((v) => v > 255)) return null;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function* colorsIn(text: string): Generator<string> {
  for (const m of text.matchAll(HEX)) {
    const hex = normalizeHex(`#${m[1]}`);
    if (hex) yield hex;
  }
  for (const m of text.matchAll(RGB)) {
    const hex = rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]));
    if (hex) yield hex;
  }
}

/** Angular distance between two hues, 0-180. */
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

export function extractBrandColors(html: string, css: string[] = []): BrandColors | null {
  const score = new Map<string, number>();
  const add = (hex: string, weight: number) => score.set(hex, (score.get(hex) ?? 0) + weight);

  // Explicit signals first.
  for (const m of html.matchAll(/<meta[^>]+name=["']theme-color["'][^>]*>/gi)) {
    for (const hex of colorsIn(m[0])) add(hex, 40);
  }
  for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']msapplication-TileColor["']/gi)) {
    for (const hex of colorsIn(m[1]!)) add(hex, 20);
  }
  const sources = [html, ...css];
  for (const src of sources) {
    // Design tokens named like a brand colour: --primary, --brand-color, --accent ...
    for (const m of src.matchAll(/--[\w-]*(primary|brand|accent|main|theme)[\w-]*\s*:\s*([^;}{]+)/gi)) {
      const weight = /accent|secondary/i.test(m[0]) ? 12 : 25;
      for (const hex of colorsIn(m[2]!)) add(hex, weight);
    }
  }
  // Then plain frequency, capped per colour so one repeated declaration can't dominate.
  const counts = new Map<string, number>();
  for (const src of sources) for (const hex of colorsIn(src)) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  for (const [hex, n] of counts) add(hex, Math.min(n, 15));

  const ranked = [...score.entries()]
    .filter(([hex]) => isBrandable(hex))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([hex]) => hex);
  if (!ranked.length) return null;

  const primary = ranked[0]!;
  const accent = ranked.find((c) => c !== primary && hueGap(hsl(c).h, hsl(primary).h) >= 30) ?? null;
  return { primary, accent, detected: ranked.slice(0, 6) };
}

/** Stylesheet URLs to fetch for a page, same-page order, capped. */
export function stylesheetUrls(html: string, baseUrl: string, max = 2): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?stylesheet/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      out.push(new URL(href, baseUrl).toString());
    } catch {
      /* skip malformed hrefs */
    }
    if (out.length >= max) break;
  }
  return out;
}

/** Pick a header colour that reads on white (accents are used as borders and text on white). */
export function accentOnWhite(accent: string, fallback: string): string {
  return hsl(accent).l > 0.62 ? fallback : accent;
}
