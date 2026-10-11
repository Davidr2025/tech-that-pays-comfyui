import { SERVICES } from "../config";
import SpotlightCard from "../components/SpotlightCard";
import SplitText from "../components/SplitText";
import Reveal from "../components/Reveal";

export default function Services() {
  return (
    <section className="section" id="services">
      <div className="wrap">
        <Reveal className="eyebrow">What we do</Reveal>
        <SplitText className="h2 section-title" text="Four ways we move your business forward." />
        <Reveal className="cards" stagger={0.12}>
          {SERVICES.map((s) => (
            <SpotlightCard key={s.n} className="card">
              <span className="card-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <ul className="tags">
                {s.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </SpotlightCard>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
