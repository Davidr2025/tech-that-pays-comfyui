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
          <SplitText className="h2" text="Built for companies past the $1M mark." />
          <Reveal as="p" className="lead" delay={0.1}>
            Once revenue passes the first million, AI stops being a personal productivity hack and
            becomes an organisational change. That's where we work, from $1M up to around $50M.
          </Reveal>
          <Reveal className="bignum">
            <strong>
              <CountUp to={1} prefix="$" suffix="M+" duration={1.2} />
            </strong>
            <span>
              in annual revenue is where
              <br />
              structure starts to pay for itself
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
