// TEMPORARY diagnostic round 4: events sources. Delete when config is final.
const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function get(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": UA_BROWSER, accept: "application/json,*/*", "accept-language": "en-CA,en;q=0.9" }
  });
  return { status: res.status, type: res.headers.get("content-type"), text: await res.text() };
}

// full route list of the city's custom REST namespace
try {
  const r = await get("https://www.mississauga.ca/wp-json/com/v1");
  const routes = [...r.text.matchAll(/"\\\/com\\\/v1\\\/[^"]+"/g)].map((m) => m[0].replace(/\\\//g, "/"));
  console.log("com/v1 routes:\n  " + [...new Set(routes)].join("\n  "));
} catch (e) {
  console.log("com/v1 ERROR", e.message);
}

for (const url of [
  "https://www.mississauga.ca/wp-json/com/v1/lists/event?posts_per_page=3",
  "https://www.mississauga.ca/wp-json/com/v1/lists/events?posts_per_page=3",
  "https://www.mississauga.ca/wp-json/wp/v2/event?per_page=3&_fields=title,link,date",
  "https://www.mississauga.ca/wp-json/wp/v2/events?per_page=3&_fields=title,link,date",
  "https://www.visitmississauga.ca/wp-json/tribe/events/v1/events?per_page=3",
  "https://www.visitmississauga.ca/events/?ical=1",
  "https://www.visitmississauga.ca/wp-json/",
  "https://www.visitmississauga.ca/events/feed/"
]) {
  try {
    const r = await get(url);
    console.log(`\n===== ${url} → HTTP ${r.status} ${r.type} len=${r.text.length}`);
    console.log(r.text.slice(0, 700).replace(/\s+/g, " "));
  } catch (e) {
    console.log(`\n===== ${url} → ERROR ${e.message}`);
  }
}
