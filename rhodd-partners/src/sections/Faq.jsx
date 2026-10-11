import { useState } from "react";
import { FAQ } from "../config";
import SplitText from "../components/SplitText";
import Reveal from "../components/Reveal";

export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="section" id="faq">
      <div className="wrap faq-grid">
        <div>
          <Reveal className="eyebrow">FAQ</Reveal>
          <SplitText className="h2" text="Straight answers." />
        </div>
        <Reveal className="faq" stagger={0.08}>
          {FAQ.map((f, i) => (
            <div key={f.q} className={`faq-item ${open === i ? "is-open" : ""}`}>
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                {f.q}
                <span aria-hidden="true">+</span>
              </button>
              <div className="faq-a">
                <p>{f.a}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
