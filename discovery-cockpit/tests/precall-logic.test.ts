import { describe, expect, it } from "vitest";
import { accentOnWhite, extractBrandColors, isBrandable, normalizeHex, stylesheetUrls } from "@/lib/brand";
import { isValidLogoUrl, logoProblem, MAX_LOGO_CHARS } from "@/lib/logo";
import { assertTransition, canTransition, InvalidTransitionError, SESSION_STATUSES } from "@/lib/sessions";
import { hexColor, optionalUrl } from "@/lib/validation";

describe("brand colour detection", () => {
  it("prefers theme-color and brand tokens over incidental colours", () => {
    const html = `<head><meta name="theme-color" content="#1d4ed8"><style>
      :root { --brand-primary: #1d4ed8; --accent: #f59e0b; }
      body { color: #111111; background: #ffffff } a { color: #6b7280 }
    </style></head>`;
    expect(extractBrandColors(html)).toEqual({ primary: "#1d4ed8", accent: "#f59e0b", detected: ["#1d4ed8", "#f59e0b"] });
  });

  it("ignores white, black and greys however often they appear", () => {
    const css = ".a{color:#fff}".repeat(40) + ".b{color:#000}".repeat(40) + ".c{color:#888888}".repeat(40) + ".d{background:#0f766e}";
    expect(extractBrandColors("<p>x</p>", [css])?.primary).toBe("#0f766e");
  });

  it("reads rgb() and 3-digit hex, and merges them into one colour", () => {
    const r = extractBrandColors(`<style>.a{color:rgb(15,118,110)} .b{color:#0f766e} .c{color:#c40}</style>`);
    expect(r?.primary).toBe("#0f766e");
    expect(r?.detected).toContain("#cc4400");
  });

  it("picks an accent that is visibly different from the primary", () => {
    const r = extractBrandColors(`<style>--primary:#2563eb; .x{color:#2f6bf0} .y{color:#e11d48}</style>`);
    expect(r?.primary).toBe("#2563eb");
    expect(r?.accent).toBe("#e11d48"); // not the near-identical blue
  });

  it("returns null when a page has no brand colour (so the consultant picks one)", () => {
    expect(extractBrandColors("<p>plain</p>", ["body{color:#222;background:#fff}"])).toBeNull();
    expect(extractBrandColors("")).toBeNull();
  });

  it("finds stylesheet links, resolves them against the page, and caps them", () => {
    const html = `<link rel="stylesheet" href="/a.css"><link rel="icon" href="/f.ico"><link href="https://cdn.example/b.css" rel="stylesheet"><link rel="stylesheet" href="c.css">`;
    expect(stylesheetUrls(html, "https://brightline.example/about/")).toEqual(["https://brightline.example/a.css", "https://cdn.example/b.css"]);
    expect(stylesheetUrls(html, "https://brightline.example/", 3)).toHaveLength(3);
  });

  it("normalises hex and judges brandability", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("blue")).toBeNull();
    expect(isBrandable("#0f766e")).toBe(true);
    expect(isBrandable("#ffffff")).toBe(false);
    expect(isBrandable("#808080")).toBe(false);
  });

  it("falls back from an accent too pale to read on white", () => {
    expect(accentOnWhite("#d97706", "#0f766e")).toBe("#d97706");
    expect(accentOnWhite("#fde68a", "#0f766e")).toBe("#0f766e");
  });
});

describe("session status machine", () => {
  it("allows the forward path and only the backward steps the data really takes", () => {
    for (const [a, b] of [["SETUP", "LIVE"], ["LIVE", "REVIEW"], ["REVIEW", "REVEALED"], ["REVEALED", "COMPLETED"], ["REVIEW", "LIVE"], ["REVEALED", "REVIEW"], ["REVEALED", "LIVE"]] as const) {
      expect(canTransition(a, b), `${a}->${b}`).toBe(true);
    }
  });

  it("refuses skips and anything out of COMPLETED", () => {
    expect(canTransition("SETUP", "REVIEW")).toBe(false);
    expect(canTransition("SETUP", "REVEALED")).toBe(false);
    expect(canTransition("LIVE", "COMPLETED")).toBe(false);
    for (const to of SESSION_STATUSES) if (to !== "COMPLETED") expect(canTransition("COMPLETED", to)).toBe(false);
  });

  it("treats staying put as fine and explains a refusal in plain words", () => {
    expect(canTransition("LIVE", "LIVE")).toBe(true);
    expect(() => assertTransition("COMPLETED", "LIVE")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("COMPLETED", "LIVE")).toThrow(/session is complete/);
    expect(() => assertTransition("SETUP", "REVEALED")).toThrow(/cannot go from SETUP to REVEALED/);
  });
});

describe("logo validation", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  it("accepts small raster and SVG data URLs", () => {
    expect(isValidLogoUrl(png)).toBe(true);
    expect(isValidLogoUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBe(true);
    expect(isValidLogoUrl("data:image/webp;base64,UklGRg==")).toBe(true);
  });

  it("rejects scripts, remote URLs, other types and oversized files", () => {
    for (const bad of ["https://evil.example/logo.png", "javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "data:image/gif;base64,R0lGOD==", "data:image/png,rawtext", "data:image/png;base64,@@@", ""]) {
      expect(isValidLogoUrl(bad), bad).toBe(false);
    }
    expect(logoProblem(`data:image/png;base64,${"A".repeat(MAX_LOGO_CHARS)}`)).toMatch(/too large/);
    expect(logoProblem("data:image/gif;base64,R0lGOD==")).toMatch(/PNG, JPEG, WebP or SVG/);
    expect(logoProblem(png)).toBeNull();
  });
});

describe("input validation helpers", () => {
  it("accepts and lowercases 6-digit hex colours only", () => {
    expect(hexColor.parse("#0F766E")).toBe("#0f766e");
    for (const bad of ["0f766e", "#fff", "#12345", "red", "#gggggg"]) expect(hexColor.safeParse(bad).success, bad).toBe(false);
  });

  it("turns blanks into null and adds https:// to bare domains", () => {
    expect(optionalUrl.parse("")).toBeNull();
    expect(optionalUrl.parse(undefined)).toBeNull();
    expect(optionalUrl.parse("calendly.com/avery/30min")).toBe("https://calendly.com/avery/30min");
    expect(optionalUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(optionalUrl.safeParse("ftp://x.example").success).toBe(false);
  });
});
