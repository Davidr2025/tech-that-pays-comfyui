// TEMPORARY diagnostic round 3: find the events API route on
// os-prod-api.mississauga.ca. Delete when site.config.mjs is final.
const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function get(url, extra = {}) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": UA_BROWSER,
      accept: "application/json,*/*",
      origin: "https://www.mississauga.ca",
      referer: "https://www.mississauga.ca/events-and-attractions/events-calendar/",
      ...extra
    }
  });
  return { status: res.status, type: res.headers.get("content-type"), text: await res.text() };
}

// 1) dump every quoted string in app.js containing 'event' or 'api'
try {
  const res = await fetch("https://www.mississauga.ca/webapps/mississauga-events-calendar/js/app.js", {
    headers: { "user-agent": UA_BROWSER }
  });
  const js = await res.text();
  const strs = js.match(/["'`][^"'`\n]{2,160}["'`]/g) || [];
  const interesting = [...new Set(strs.filter((s) => /event|api|calendar|list|search|categor/i.test(s)))];
  console.log("app.js interesting strings:\n  " + interesting.slice(0, 120).join("\n  "));
} catch (e) {
  console.log("app.js ERROR", e.message);
}

for (const url of [
  "https://os-prod-api.mississauga.ca/api/v1/",
  "https://os-prod-api.mississauga.ca/api/v1/events",
  "https://os-prod-api.mississauga.ca/api/v1/events?limit=3",
  "https://os-prod-api.mississauga.ca/api/v1/event-listing",
  "https://os-prod-api.mississauga.ca/api/v1/calendar/events"
]) {
  try {
    const r = await get(url);
    console.log(`\n===== ${url} → HTTP ${r.status} ${r.type} len=${r.text.length}`);
    console.log(r.text.slice(0, 900));
  } catch (e) {
    console.log(`\n===== ${url} → ERROR ${e.message}`);
  }
}
