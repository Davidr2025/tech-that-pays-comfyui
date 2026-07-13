// ============================================================
// Mississauga Insider — site configuration
// This is the ONE file to edit for branding, colors, and sources.
// ============================================================

export default {
  // --- Brand (rename freely) ---
  name: "Mississauga Insider",
  tagline: "Your city, curated. News, events & local gems — every week.",
  description:
    "Mississauga Insider curates the top local news, things to do, and standout local businesses in Mississauga, Ontario. Updated automatically every 6 hours.",
  city: "Mississauga",
  province: "Ontario",

  // Beehiiv hosted subscribe page (fallback when the serverless API
  // isn't available, e.g. on GitHub Pages). Example:
  // "https://your-pub.beehiiv.com/subscribe"
  newsletterUrl: "",

  // --- Brand colors (used as CSS variables across the whole site) ---
  colors: {
    primary: "#0e4d92",      // deep lake blue
    primaryDark: "#093461",
    accent: "#f59e0b",       // warm amber (CTA)
    accentDark: "#d97706",
    bg: "#f7f8fa",
    surface: "#ffffff",
    text: "#16212e",
    muted: "#5b6b7c",
    border: "#e3e8ee"
  },

  // --- TOP NEWS sources (RSS). Each source lists candidate feed URLs;
  // the pipeline uses the first one that responds with a valid feed.
  // Items are always shown as headline + short excerpt + link OUT to
  // the original, with visible source credit. Never full articles.
  news: {
    maxPerSource: 5,
    maxTotal: 12,
    // Sources without `filter` are already Mississauga-specific.
    // Regional sources are keyword-filtered for Mississauga relevance.
    sources: [
      {
        name: "City of Mississauga",
        homepage: "https://www.mississauga.ca/city-of-mississauga-news/",
        candidates: [
          "https://www.mississauga.ca/city-of-mississauga-news/feed/",
          "https://www.mississauga.ca/feed/"
        ]
      },
      {
        name: "insauga",
        homepage: "https://www.insauga.com/mississauga/",
        candidates: [
          "https://www.insauga.com/category/mississauga/feed/",
          "https://www.insauga.com/feed/"
        ]
      },
      {
        name: "CBC Toronto",
        homepage: "https://www.cbc.ca/news/canada/toronto",
        filter: true,
        candidates: [
          "https://www.cbc.ca/webfeed/rss/rss-canada-toronto",
          "https://rss.cbc.ca/lineup/canada-toronto.xml"
        ]
      },
      {
        name: "Toronto Star",
        homepage: "https://www.thestar.com/news/gta/",
        filter: true,
        candidates: [
          "https://www.thestar.com/search/?f=rss&t=article&q=mississauga&l=25&s=start_time&sd=desc",
          "https://www.thestar.com/search/?f=rss&t=article&c=news/gta*&l=25&s=start_time&sd=desc"
        ]
      }
    ],
    // Keyword filter applied to regional (GTA-wide) sources
    keywords: [
      "mississauga", "peel", "square one", "port credit", "streetsville",
      "cooksville", "erin mills", "clarkson", "malton", "meadowvale",
      "lakeview", "hurontario", "miway", "celebration square", "sheridan",
      "dixie", "applewood", "churchill meadows", "lisgar"
    ]
  },

  // --- TOP THINGS TO DO ---
  events: {
    daysAhead: 14,
    maxItems: 12,
    city: {
      name: "City of Mississauga events calendar",
      homepage: "https://www.mississauga.ca/events-and-attractions/events-calendar/",
      // Tried in order: WordPress Events Calendar REST API, then iCal export
      restCandidates: [
        "https://www.mississauga.ca/wp-json/tribe/events/v1/events?per_page=50&start_date=__START__&end_date=__END__"
      ],
      icalCandidates: [
        "https://www.mississauga.ca/events-and-attractions/events-calendar/?ical=1"
      ]
    },
    // Eventbrite: their PUBLIC event-search API was retired in 2020, so
    // location search is no longer possible. Instead, list Eventbrite
    // organizer IDs of Mississauga venues you want to pull from
    // (requires EVENTBRITE_API_TOKEN). Find organizer IDs in any of the
    // organizer's Eventbrite page URLs.
    eventbriteOrganizers: [
      // e.g. "12345678901"
    ]
  },

  // --- Weather (Open-Meteo, no API key needed) ---
  weather: {
    latitude: 43.589,
    longitude: -79.6441,
    timezone: "America/Toronto"
  },

  // --- Local sports (best effort via TheSportsDB free tier) ---
  sports: {
    teams: ["Raptors 905", "Toronto Raptors", "Toronto Maple Leafs", "Toronto Blue Jays", "Toronto FC"]
  },

  // --- LOCAL BUSINESS DIRECTORY (Google Places API, cached weekly) ---
  places: {
    cacheDays: 7,
    resultsPerCategory: 10,
    categories: [
      { slug: "restaurants",  label: "Restaurants",        query: "best restaurants in Mississauga, Ontario" },
      { slug: "cafes",        label: "Cafés & Bakeries",   query: "best cafes and bakeries in Mississauga, Ontario" },
      { slug: "trades",       label: "Trades & Home Services", query: "top rated plumbers electricians contractors in Mississauga, Ontario" },
      { slug: "real-estate",  label: "Real Estate",        query: "real estate agencies in Mississauga, Ontario" },
      { slug: "health",       label: "Health & Wellness",  query: "clinics dentists physiotherapy in Mississauga, Ontario" },
      { slug: "fitness",      label: "Fitness & Sports",   query: "gyms and fitness studios in Mississauga, Ontario" },
      { slug: "auto",         label: "Auto Services",      query: "top rated auto repair shops in Mississauga, Ontario" },
      { slug: "beauty",       label: "Beauty & Barber",    query: "best hair salons and barbershops in Mississauga, Ontario" }
    ]
  }
};
