import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { STEPS } from "../config";
import SplitText from "../components/SplitText";
import Reveal from "../components/Reveal";

gsap.registerPlugin(ScrollTrigger);

export default function Approach() {
  const root = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // Progress line scrubs with scroll through the step list.
      gsap.fromTo(
        ".steps-line-fill",
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          scrollTrigger: { trigger: ".steps", start: "top 60%", end: "bottom 60%", scrub: true },
        }
      );
      // Each step lights up as it crosses the middle of the viewport.
      gsap.utils.toArray(".step").forEach((el) => {
        ScrollTrigger.create({
          trigger: el,
          start: "top 60%",
          end: "bottom 60%",
          toggleClass: { targets: el, className: "is-active" },
        });
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section className="section section--dark" id="approach" ref={root}>
      <div className="wrap approach-grid">
        <div className="approach-sticky">
          <Reveal className="eyebrow">Our approach</Reveal>
          <SplitText className="h2" text="A four-step path from experiments to everyday practice." />
          <Reveal as="p" className="lead" delay={0.1}>
            Every engagement follows the same arc, scaled to your size. Each step ends with something
            you can use, not a slide deck that sits in a folder.
          </Reveal>
        </div>
        <ol className="steps">
          <span className="steps-line" aria-hidden="true">
            <span className="steps-line-fill" />
          </span>
          {STEPS.map((s) => (
            <li key={s.n} className="step">
              <span className="step-n">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <span className="step-out">Output → {s.out}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
