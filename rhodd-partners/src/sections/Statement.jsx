import Marquee from "../components/Marquee";
import Reveal from "../components/Reveal";
import SplitText from "../components/SplitText";

// No invented metrics: these are our principles, not claimed results.
const PRINCIPLES = [
  { k: "People first", v: "Adoption beats technology. We plan for the humans from day one." },
  { k: "Tool-agnostic", v: "No reseller deals. Recommendations come from your workflows." },
  { k: "Small releases", v: "Ship something useful in weeks, measure it, then build the next." },
  { k: "Hand-over, not lock-in", v: "You leave with playbooks and a team that can run without us." },
];

export default function Statement() {
  return (
    <section className="statement">
      <Marquee
        items={["AI Strategy", "Workflow Automation", "Change Management", "Team Training", "Governance", "Adoption"]}
      />
      <div className="wrap statement-grid">
        <div>
          <Reveal className="eyebrow">The problem</Reveal>
          <SplitText
            className="h2"
            text="Most AI projects don't fail on technology. They fail on people."
          />
        </div>
        <Reveal as="p" className="lead" delay={0.1}>
          Teams buy licences, run a workshop, and six weeks later nothing has changed. The gap
          between "we have AI tools" and "our business runs differently" is a change-management
          problem — and it's the one we're built to solve.
        </Reveal>
      </div>
      <Reveal className="wrap principles" stagger={0.1}>
        {PRINCIPLES.map((p) => (
          <div key={p.k} className="principle">
            <h3>{p.k}</h3>
            <p>{p.v}</p>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
