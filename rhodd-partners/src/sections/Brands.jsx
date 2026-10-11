import { BRANDS, BRANDS_DISCLAIMER } from "../config";
import Reveal from "../components/Reveal";
import SplitText from "../components/SplitText";

export default function Brands() {
  const items = BRANDS.length ? BRANDS : Array.from({ length: 8 }, () => null);
  return (
    <section className="section brands" id="experience">
      <div className="wrap">
        <Reveal className="eyebrow">Experience from the inside</Reveal>
        <SplitText className="h2 section-title" text="We know how real companies run, buy and change." />
        <Reveal as="p" className="lead" delay={0.1}>
          Our founder has worked for, and done business with, organisations like these. That
          first-hand view of how decisions get made and how change actually lands shapes every
          engagement.
        </Reveal>
        <Reveal className="brand-grid" stagger={0.06}>
          {items.map((b, i) => (
            <div key={b ? b.name : i} className={`brand ${b ? "" : "brand--empty"}`}>
              {b && b.logo ? (
                <img src={b.logo} alt={b.name} loading="lazy" />
              ) : b ? (
                <span>{b.name}</span>
              ) : (
                <span>Logo</span>
              )}
            </div>
          ))}
        </Reveal>
        <p className="brand-note">{BRANDS_DISCLAIMER}</p>
      </div>
    </section>
  );
}
