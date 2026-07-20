// ============================================================
// Mississauga Insider — site configuration
// This is the ONE file to edit for branding, colors, and sources.
// ============================================================

export default {
  // --- Brand (rename freely) ---
  name: "Mississauga Insider",
  tagline: "Your city, curated. News, events & local gems, every week.",
  description:
    "Mississauga Insider curates the top local news, things to do, and standout local businesses in Mississauga, Ontario. Updated automatically every 6 hours.",
  city: "Mississauga",
  province: "Ontario",

  // Beehiiv hosted subscribe page (last-resort text link if the inline
  // embed below can't load, e.g. blocked by an ad blocker). Example:
  // "https://your-pub.beehiiv.com/subscribe"
  newsletterUrl: "https://mississauga-insider-newsletter.beehiiv.com/",

  // Beehiiv "Subscribe form" ID (Audience → Subscribe forms → Get embed
  // code → the value of data-beehiiv-form). Powers the inline signup
  // widget used when the serverless /api/subscribe endpoint isn't
  // available (e.g. on GitHub Pages) — no redirect, submits in place.
  beehiivFormId: "d19d7ac3-659f-4990-848d-d8db8366ac59",

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
    // Some outlets (insauga, Toronto Star) block/rate-limit direct feed
    // access, so their headlines are pulled through Google News site:
    // queries — the visible credit and outbound link still go to the outlet.
    sources: [
      {
        name: "City of Mississauga",
        homepage: "https://www.mississauga.ca/city-of-mississauga-news/",
        candidates: [
          // content is requested as a fallback for excerpt — this CPT
          // appears not to have excerpt support registered (see parseWpJson
          // in fetch-news.mjs), so excerpt.rendered otherwise comes back
          // empty even on a successful request.
          "https://www.mississauga.ca/wp-json/wp/v2/news?per_page=10&orderby=date&_fields=title,link,date,excerpt,content",
          "https://www.mississauga.ca/feed/",
          "https://news.google.com/rss/search?q=site:mississauga.ca&hl=en-CA&gl=CA&ceid=CA:en"
        ]
      },
      {
        name: "insauga",
        homepage: "https://www.insauga.com/mississauga/",
        candidates: [
          "https://news.google.com/rss/search?q=site:insauga.com%20mississauga&hl=en-CA&gl=CA&ceid=CA:en"
        ]
      },
      {
        // Despite the name, this outlet also carries syndicated wire/press-
        // release content (financial services, engineering-firm PR, generic
        // regional weather alerts) with no Mississauga relevance — filter it
        // like the GTA-wide sources below.
        name: "Mississauga.com",
        homepage: "https://www.mississauga.com/",
        filter: true,
        candidates: [
          // Metroland/Torstar sites often share the same search-RSS pattern
          // as thestar.com (below) — try the direct feed first.
          "https://www.mississauga.com/search/?f=rss&t=article&l=25&s=start_time&sd=desc",
          "https://news.google.com/rss/search?q=site:mississauga.com&hl=en-CA&gl=CA&ceid=CA:en"
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
          "https://news.google.com/rss/search?q=site:thestar.com%20mississauga&hl=en-CA&gl=CA&ceid=CA:en"
        ]
      },
      {
        name: "Google News",
        homepage: "https://news.google.com/search?q=mississauga%20ontario&hl=en-CA&gl=CA&ceid=CA:en",
        filter: true,
        candidates: [
          "https://news.google.com/rss/search?q=mississauga%20ontario%20when:2d&hl=en-CA&gl=CA&ceid=CA:en"
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
    // Visit Mississauga is the City's official tourism agency — its public
    // events calendar (The Events Calendar REST API + iCal) is the reliable
    // machine-readable source. (The city's own events-calendar app sits
    // behind an API that blocks datacenter IPs.)
    city: {
      name: "Visit Mississauga",
      homepage: "https://www.visitmississauga.ca/events/",
      restCandidates: [
        "https://www.visitmississauga.ca/wp-json/tribe/events/v1/events?per_page=50&start_date=__START__&end_date=__END__"
      ],
      icalCandidates: [
        "https://www.visitmississauga.ca/events/?ical=1"
      ]
    },
    // Eventbrite: their PUBLIC event-search API was retired in 2020, so
    // location search is no longer possible. Instead, list Eventbrite
    // organizer IDs of Mississauga venues you want to pull from
    // (requires EVENTBRITE_API_TOKEN, set as a GitHub Actions repo secret).
    // Find organizer IDs in any of the organizer's Eventbrite page URLs
    // (the trailing number, e.g. eventbrite.com/o/some-org-18391797650).
    eventbriteOrganizers: [
      "18391797650", // Streetsville BIA — village events, First Friday Market, etc.
      "18523231290"  // Mississauga Library — branch programs and events
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

  // --- LOCAL BUSINESS DIRECTORY (Google Places API, cached monthly) ---
  // This directory is a lead magnet: it's meant to be big (~100 businesses
  // per niche) so you have real prospects to contact about paid placements.
  // Google's Text Search caps every query at 20 results with no pagination,
  // so reaching ~100 per niche requires querying the same niche phrased
  // across several Mississauga neighborhoods and merging by place_id —
  // `areas` below is that list ("" = city-wide, using the query as-is).
  // 100 is a CEILING, not a guarantee: narrow niches (e.g. Locksmiths) may
  // genuinely have fewer than 100 distinct real businesses in one city even
  // after area-splitting; broad niches (Restaurants) are more likely to
  // approach it.
  places: {
    cacheDays: 30,
    resultsPerCategory: 100,
    areas: [
      "", "Port Credit", "Streetsville", "Erin Mills", "Meadowvale",
      "Clarkson", "Cooksville", "Malton", "Lakeview"
    ],
    categories: [
      { slug: "restaurants",  label: "Restaurants",        query: "best restaurants in Mississauga, Ontario" },
      { slug: "cafes",        label: "Cafés & Bakeries",   query: "best cafes and bakeries in Mississauga, Ontario" },
      {
        // Google's Text Search caps each query at 20 results, so a single
        // "plumbers electricians contractors" query can never grow past 20.
        // Splitting into per-trade queries lets this category grow well
        // beyond that, with each trade type ranked and capped on its own so
        // no single trade (e.g. painters) crowds out the others.
        slug: "trades",
        label: "Trades & Home Services",
        perSubcategory: 100,
        subcategories: [
          { label: "Plumbers",                        query: "best plumbers in Mississauga, Ontario" },
          { label: "Electricians",                     query: "best electricians in Mississauga, Ontario" },
          { label: "HVAC & Heating",                   query: "best HVAC heating and air conditioning companies in Mississauga, Ontario" },
          { label: "Roofers",                          query: "best roofing contractors in Mississauga, Ontario" },
          { label: "Landscaping & Lawn Care",          query: "best landscaping and lawn care companies in Mississauga, Ontario" },
          { label: "Painters",                         query: "best house painters in Mississauga, Ontario" },
          { label: "General Contractors & Renovations", query: "best general contractors and home renovation companies in Mississauga, Ontario" },
          { label: "Locksmiths",                       query: "best locksmiths in Mississauga, Ontario" },
          { label: "Appliance Repair",                 query: "best appliance repair services in Mississauga, Ontario" },
          { label: "Cleaning Services",                query: "best house cleaning services in Mississauga, Ontario" }
        ]
      },
      { slug: "real-estate",  label: "Real Estate",        query: "real estate agencies in Mississauga, Ontario" },
      { slug: "health",       label: "Health & Wellness",  query: "clinics dentists physiotherapy in Mississauga, Ontario" },
      { slug: "fitness",      label: "Fitness & Sports",   query: "gyms and fitness studios in Mississauga, Ontario" },
      { slug: "auto",         label: "Auto Services",      query: "top rated auto repair shops in Mississauga, Ontario" },
      { slug: "beauty",       label: "Beauty & Barber",    query: "best hair salons and barbershops in Mississauga, Ontario" }
    ]
  }
};
