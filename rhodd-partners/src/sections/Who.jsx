import { SEGMENTS } from "../config";
import SplitText from "../components/SplitText";
import Reveal from "../components/Reveal";
import CountUp from "../components/CountUp";

export default function Who() {
  return (
    <section className="section" id="who">
      <div className="wrap who-grid">
        <div>
          <Reveal className="eyebrow">Who we serve</Reveal>
          <SplitText className="h2" text="Built for teams of five and up." />
          <Reveal as="p" className="lead" delay={0.1}>
            Once you have more than a handful of people, AI stops being a personal productivity hack
            and becomes an organisational change. That's where we work.
          </Reveal>
          <Reveal className="bignum">
            <strong>
              <CountUp to={5} suffix="+" duration={1.2} />
            </strong>
            <span>
              people is where structure
              <br />
              starts to pay for itself
            </span>
          </Reveal>
        </div>
        <Reveal className="segments" stagger={0.12}>
          {SEGMENTS.map((s) => (
            <div key={s.size} className="segment">
              <span className="segment-size">{s.size}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
