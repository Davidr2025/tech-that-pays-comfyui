// Everything David may want to change lives here — no hunting through components.
// TODO(David): replace CONTACT_EMAIL with the real address (and add a booking link if you use one).
export const CONTACT_EMAIL = "hello@rhoddpartners.com";
export const BOOKING_URL = ""; // e.g. a Calendly / GHL calendar link. Empty = hide the button.

export const NAV = [
  { label: "Services", href: "#services" },
  { label: "Approach", href: "#approach" },
  { label: "Who we serve", href: "#who" },
  { label: "FAQ", href: "#faq" },
];

export const SERVICES = [
  {
    n: "01",
    title: "AI Strategy & Roadmap",
    body: "We map where AI actually moves your numbers — then rank the opportunities by impact, effort and risk, so you fund the right three things instead of thirty.",
    tags: ["Opportunity audit", "Prioritised roadmap", "Build / buy / wait"],
  },
  {
    n: "02",
    title: "Workflow Automation",
    body: "We design and deploy AI-assisted workflows in the tools your team already uses: sales follow-up, client onboarding, reporting, admin, support.",
    tags: ["Process redesign", "Agent & tool setup", "Integrations"],
  },
  {
    n: "03",
    title: "Change Management & Training",
    body: "Tools don't transform companies; people do. Role-based training, champions, and clear working agreements so adoption is a habit, not a launch-week spike.",
    tags: ["Team training", "AI champions", "Adoption tracking"],
  },
  {
    n: "04",
    title: "Governance & Responsible Use",
    body: "Practical policies on data, privacy, and quality control — short enough that people read them, solid enough that your clients and insurers trust them.",
    tags: ["Usage policy", "Data handling", "Review standards"],
  },
];

export const STEPS = [
  {
    n: "01",
    title: "Listen",
    body: "Interviews and a workflow review across your team. We find where time and money leak, and where people are already (quietly) using AI.",
    out: "Opportunity map",
  },
  {
    n: "02",
    title: "Design",
    body: "A short, ranked roadmap with owners, costs and success measures — plus a plain-language plan for how the change lands with your people.",
    out: "90-day roadmap",
  },
  {
    n: "03",
    title: "Deploy",
    body: "We build and ship the first automations with your team, in small releases, measuring each against the baseline we set in step one.",
    out: "Live workflows",
  },
  {
    n: "04",
    title: "Embed",
    body: "Training, champions and a review rhythm so the gains compound after we leave. We hand over playbooks, not dependency.",
    out: "Self-sufficient team",
  },
];

export const SEGMENTS = [
  {
    size: "5–20 people",
    title: "Founder-led teams",
    body: "You're the bottleneck and you know it. We give you leverage — back-office and client work that runs without you in the middle of it.",
  },
  {
    size: "20–100 people",
    title: "Scaling companies",
    body: "Processes are straining and every department is experimenting alone. We create one shared direction, one set of standards.",
  },
  {
    size: "100+ people",
    title: "Established teams",
    body: "You need coordination, governance and adoption across departments. We run the change programme alongside your leadership.",
  },
];

export const FAQ = [
  {
    q: "Why 5 employees as a minimum?",
    a: "Below five people, the gains are mostly personal productivity — a good workshop covers it. From five up, you have handoffs, shared processes and habits to change, which is where a structured approach pays for itself.",
  },
  {
    q: "Do we need a technical team to work with you?",
    a: "No. Most of our clients have none. We work with the tools and people you already have, and we leave you with playbooks your team can run.",
  },
  {
    q: "Which AI tools do you use?",
    a: "Whatever fits the job and your risk profile — we're tool-agnostic and have no reseller incentives. Recommendations come from your workflows, not from a vendor.",
  },
  {
    q: "What about our data and privacy?",
    a: "It's part of every engagement. We set clear rules on what can and can't go into AI tools before anything is deployed, and document them.",
  },
  {
    q: "How do we start?",
    a: "A free 30-minute conversation. If there's a fit, we scope a short paid discovery. If there isn't, we'll say so and point you somewhere useful.",
  },
];
