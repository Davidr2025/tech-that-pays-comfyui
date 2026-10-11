import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { reducedMotion } from "../hooks/useLenis";

gsap.registerPlugin(ScrollTrigger);

// React Bits style CountUp, implemented with GSAP + ScrollTrigger.
export default function CountUp({ to, prefix = "", suffix = "", duration = 1.8 }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (reducedMotion()) return;
    const state = { v: 0 };
    const ctx = gsap.context(() => {
      gsap.to(state, {
        v: to,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          if (ref.current) ref.current.textContent = `${prefix}${Math.round(state.v)}${suffix}`;
        },
        scrollTrigger: { trigger: ref.current, start: "top 90%", once: true },
      });
    }, ref);
    return () => ctx.revert();
  }, [to, prefix, suffix, duration]);
  return (
    <span ref={ref}>
      {prefix}
      {to}
      {suffix}
    </span>
  );
}
