import config from "../site.config.mjs";
import {
  fetchText, fetchJson, excerpt, stripHtml, toIso, writeData, log, warn
} from "./lib/util.mjs";

/** Minimal iCalendar (.ics) parser — enough for VEVENT blocks. */
function parseIcs(text) {
  // Unfold continuation lines (RFC 5545)
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const keyPart = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const key = keyPart.split(";")[0].toUpperCase();
      if (["SUMMARY", "DESCRIPTION", "LOCATION", "URL", "DTSTART", "DTEND"].includes(key)) {
        cur[key] = { value, params: keyPart };
      }
    }
  }
  return events.map((e) => ({
    title: unescapeIcs(e.SUMMARY?.value || ""),
    description: unescapeIcs(e.DESCRIPTION?.value || ""),
    venue: unescapeIcs(e.LOCATION?.value || ""),
    url: e.URL?.value || "",
    start: icsDate(e.DTSTART),
    end: icsDate(e.DTEND)
  }));
}
function unescapeIcs(s) {
  return s.replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
}
function icsDate(field) {
  if (!field) return null;
  const v = field.value;
  // 20260715T190000Z or 20260715T190000 or 20260715
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return toIso(v);
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s || "00"}${z ? "Z" : "-04:00"}`;
  return toIso(iso);
}

async function fetchCityEvents(startISO, endISO) {
  const { city } = config.events;
  // 1) The Events Calendar REST API (WordPress)
  for (const tpl of city.restCandidates) {
    const url = tpl.replace("__START__", startISO.slice(0, 10)).replace("__END__", endISO.slice(0, 10));
    try {
      const json = await fetchJson(url);
      const raw = json.events || [];
      if (raw.length) {
        log(`events: City REST API → ${raw.length} events (via ${url})`);
        return raw.map((e) => ({
          title: stripHtml(e.title || ""),
          summary: excerpt(e.description || e.excerpt || ""),
          venue: stripHtml(e.venue?.venue || e.venue?.address || ""),
          url: e.url || e.website || city.homepage,
          start: toIso(e.start_date || e.utc_start_date),
          end: toIso(e.end_date || e.utc_end_date),
          source: "City of Mississauga",
          sourceUrl: city.homepage
        }));
      }
    } catch (e) {
      warn(`events: REST candidate failed (${e.message})`);
    }
  }
  // 2) iCal export
  for (const url of city.icalCandidates) {
    try {
      const text = await fetchText(url);
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("not an ICS file");
      const evts = parseIcs(text);
      log(`events: City iCal → ${evts.length} events (via ${url})`);
      return evts.map((e) => ({
        title: e.title,
        summary: excerpt(e.description),
        venue: e.venue,
        url: e.url || city.homepage,
        start: e.start,
        end: e.end,
        source: "City of Mississauga",
        sourceUrl: city.homepage
      }));
    } catch (e) {
      warn(`events: iCal candidate failed (${e.message})`);
    }
  }
  return [];
}

async function fetchEventbrite() {
  const token = process.env.EVENTBRITE_API_TOKEN;
  const organizers = config.events.eventbriteOrganizers;
  if (!token) {
    log("events: EVENTBRITE_API_TOKEN not set — skipping Eventbrite (note: Eventbrite retired their public location-search API in 2020; configure organizer IDs in site.config.mjs)");
    return [];
  }
  if (!organizers.length) {
    log("events: no Eventbrite organizer IDs configured — skipping");
    return [];
  }
  const out = [];
  for (const org of organizers) {
    try {
      const json = await fetchJson(
        `https://www.eventbriteapi.com/v3/organizers/${org}/events/?status=live&order_by=start_asc&expand=venue`,
        { headers: { authorization: `Bearer ${token}` } }
      );
      for (const e of json.events || []) {
        out.push({
          title: stripHtml(e.name?.text || ""),
          summary: excerpt(e.summary || e.description?.text || ""),
          venue: stripHtml(e.venue?.name || ""),
          url: e.url,
          start: toIso(e.start?.utc),
          end: toIso(e.end?.utc),
          source: "Eventbrite",
          sourceUrl: "https://www.eventbrite.ca/"
        });
      }
      log(`events: Eventbrite organizer ${org} → ${(json.events || []).length} events`);
    } catch (e) {
      warn(`events: Eventbrite organizer ${org} failed: ${e.message}`);
    }
  }
  return out;
}

export async function fetchEvents() {
  const { daysAhead, maxItems } = config.events;
  const now = new Date();
  const end = new Date(now.getTime() + daysAhead * 86400_000);

  const [city, eb] = await Promise.all([
    fetchCityEvents(now.toISOString(), end.toISOString()),
    fetchEventbrite()
  ]);

  const seen = new Set();
  const items = [...city, ...eb]
    .filter((e) => e.title && e.start)
    .filter((e) => {
      const s = new Date(e.start);
      const eEnd = e.end ? new Date(e.end) : s;
      return eEnd >= now && s <= end;
    })
    .filter((e) => {
      const key = `${e.title.toLowerCase()}|${(e.start || "").slice(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, maxItems);

  return writeData("events.json", {
    updatedAt: new Date().toISOString(),
    windowDays: daysAhead,
    items
  });
}
