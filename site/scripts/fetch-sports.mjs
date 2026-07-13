import config from "../site.config.mjs";
import { fetchJson, writeData, log, warn } from "./lib/util.mjs";

// Best-effort local sports via TheSportsDB free tier. If the free API is
// unavailable the section simply hides — never blocks the pipeline.
const API = "https://www.thesportsdb.com/api/v1/json/3";

export async function fetchSports() {
  const items = [];
  for (const teamName of config.sports.teams) {
    try {
      const search = await fetchJson(`${API}/searchteams.php?t=${encodeURIComponent(teamName)}`);
      const team = search.teams?.[0];
      if (!team) continue;
      const next = await fetchJson(`${API}/eventsnext.php?id=${team.idTeam}`);
      const ev = next.events?.[0];
      if (!ev) continue;
      items.push({
        team: team.strTeam,
        league: team.strLeague,
        event: ev.strEvent,
        date: ev.dateEvent,
        time: ev.strTime || null,
        venue: ev.strVenue || null
      });
      log(`sports: ${team.strTeam} next: ${ev.strEvent} on ${ev.dateEvent}`);
    } catch (e) {
      warn(`sports: ${teamName} failed (${e.message})`);
    }
  }
  return writeData("sports.json", {
    updatedAt: new Date().toISOString(),
    source: "TheSportsDB",
    sourceUrl: "https://www.thesportsdb.com/",
    items
  });
}
