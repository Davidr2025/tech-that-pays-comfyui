import Aurora from "../components/Aurora";
import SplitText from "../components/SplitText";
import Magnet from "../components/Magnet";
import Reveal from "../components/Reveal";

export default function Hero() {
  return (
    <section className="hero" id="top">
      <Aurora />
      <div className="wrap hero-inner">
        <Reveal className="eyebrow" delay={0.1}>
          AI transformation for companies doing $1M to $50M in revenue
        </Reveal>
        <SplitText
          as="h1"
          immediate
          delay={0.25}
          className="hero-title"
          text="AI that your whole team actually uses."
        />
        <Reveal as="p" className="hero-sub" delay={0.7}>
          Rhodd Partners helps growing companies adopt AI the right way: clear strategy, working
          automations, and the change management that turns a good idea into a new way of working.
        </Reveal>
        <Reveal className="hero-cta" delay={0.9}>
          <Magnet>
            <a href="#contact" className="btn">
              Book a free 30-minute call <span aria-hidden="true">→</span>
            </a>
          </Magnet>
          <a href="#approach" className="btn btn--ghost">
            See how we work
          </a>
        </Reveal>
      </div>
      <div className="scroll-cue" aria-hidden="true">
        <span />
      </div>
    </section>
  );
}
