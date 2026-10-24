import { extractBrandColors, stylesheetUrls, type BrandColors } from "../lib/brand";
import { safeFetchText, type SafeFetchOptions } from "./safe-fetch";

/**
 * Looks at a client's website and suggests brand colours. Best effort: a missing or
 * script-rendered site returns null and the consultant picks colours by hand.
 */
export async function detectBrandColors(websiteUrl: string, options: SafeFetchOptions = {}): Promise<BrandColors | null> {
  const page = await safeFetchText(websiteUrl, options);
  const css: string[] = [];
  for (const href of stylesheetUrls(page.body, page.url)) {
    try {
      css.push((await safeFetchText(href, { ...options, maxBytes: 500_000 })).body);
    } catch {
      /* a stylesheet we can't reach just means fewer clues */
    }
  }
  return extractBrandColors(page.body, css);
}
