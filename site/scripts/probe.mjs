// TEMPORARY diagnostic round 2: find the City news post type and the
// events-calendar API endpoint. Delete when site.config.mjs is final.
const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function get(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": UA_BROWSER, accept: "*/*", "accept-language": "en-CA,en;q=0.9" }
  });
  return { status: res.status, type: res.headers.get("content-type"), text: await res.text() };
}

// 1) events-calendar app.js → look for API URLs
try {
  const app = await get("https://www.mississauga.ca/webapps/mississauga-events-calendar/js/app.js");
  console.log(`\n===== app.js → HTTP ${app.status} len=${app.text.length}`);
  const urls = app.text.match(/["'`](https?:\/\/[^"'`\s]+|\/[a-z0-9_\-/.]*(?:api|calendar|event|feed|json)[a-z0-9_\-/.?=&]*)["'`]/gi) || [];
  console.log("URL-ish strings:\n  " + [...new Set(urls)].slice(0, 60).join("\n  "));
  const axios = app.text.match(/baseURL[^,}]{0,120}|\.get\(["'`][^"'`]{0,120}|\.post\(["'`][^"'`]{0,120}/g) || [];
  console.log("HTTP calls:\n  " + [...new Set(axios)].slice(0, 40).join("\n  "));
} catch (e) {
  console.log("app.js ERROR", e.message);
}

// 2) WP post types + custom namespace routes
for (const url of [
  "https://www.mississauga.ca/wp-json/wp/v2/types",
  "https://www.mississauga.ca/wp-json/com/v1",
  "https://www.mississauga.ca/wp-json/wp/v2/posts?per_page=3&_fields=title,link,date,excerpt",
  "https://www.mississauga.ca/wp-json/wp/v2/news?per_page=3&_fields=title,link,date,excerpt",
  "https://www.mississauga.ca/wp-json/wp/v2/city-news?per_page=3&_fields=title,link,date,excerpt"
]) {
  try {
    const r = await get(url);
    console.log(`\n===== ${url} → HTTP ${r.status} ${r.type}`);
    console.log(r.text.slice(0, 1200));
  } catch (e) {
    console.log(`\n===== ${url} → ERROR ${e.message}`);
  }
}
