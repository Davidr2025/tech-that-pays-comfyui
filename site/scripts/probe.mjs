// TEMPORARY diagnostic: probes candidate feed/calendar endpoints from CI
// (where outbound network is unrestricted) and prints what each returns.
// Safe to delete once site.config.mjs points at working sources.
const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const targets = [
  ["city-news-cat-feed", "https://www.mississauga.ca/city-of-mississauga-news/feed/"],
  ["city-root-feed", "https://www.mississauga.ca/feed/"],
  ["city-news-page", "https://www.mississauga.ca/city-of-mississauga-news/news/"],
  ["insauga-feed", "https://www.insauga.com/feed/"],
  ["insauga-mississauga-feed", "https://www.insauga.com/category/mississauga/feed/"],
  ["cbc-toronto", "https://www.cbc.ca/webfeed/rss/rss-canada-toronto"],
  ["star-search-rss", "https://www.thestar.com/search/?f=rss&t=article&q=mississauga&l=25&s=start_time&sd=desc"],
  ["googlenews-mississauga", "https://news.google.com/rss/search?q=mississauga%20ontario&hl=en-CA&gl=CA&ceid=CA:en"],
  ["city-wp-root", "https://www.mississauga.ca/wp-json/"],
  ["city-tribe-events", "https://www.mississauga.ca/wp-json/tribe/events/v1/events?per_page=3"],
  ["city-cal-ical", "https://www.mississauga.ca/events-and-attractions/events-calendar/?ical=1"],
  ["city-cal-page", "https://www.mississauga.ca/events-and-attractions/events-calendar/"]
];

for (const [name, url] of targets) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA_BROWSER, accept: "*/*", "accept-language": "en-CA,en;q=0.9" }
    });
    const text = await res.text();
    console.log(`\n===== ${name} → HTTP ${res.status} ${res.headers.get("content-type")} len=${text.length}`);
    const items = (text.match(/<item[\s>]/g) || []).length + (text.match(/<entry[\s>]/g) || []).length;
    console.log(`items/entries: ${items}`);
    console.log(text.slice(0, 500).replace(/\s+/g, " "));
    if (name === "city-cal-page") {
      const hints = text.match(/https?:\/\/[^"' ]*(ical|\.ics|feed|calendar[^"' ]*api|api[^"' ]*calendar|events[^"' ]*json|json[^"' ]*events)[^"' ]*/gi) || [];
      console.log("CAL HINTS:", [...new Set(hints)].slice(0, 30).join("\n  "));
      const scripts = text.match(/<script[^>]*src="([^"]+)"/g) || [];
      console.log("SCRIPTS:", scripts.slice(0, 20).join("\n  "));
      const dataAttrs = text.match(/data-[a-z-]*(api|feed|source|calendar)[a-z-]*="[^"]*"/gi) || [];
      console.log("DATA ATTRS:", [...new Set(dataAttrs)].slice(0, 20).join("\n  "));
    }
  } catch (e) {
    console.log(`\n===== ${name} → ERROR ${e.message}`);
  } finally {
    clearTimeout(t);
  }
}
