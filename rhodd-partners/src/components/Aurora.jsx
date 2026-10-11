import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { reducedMotion } from "../hooks/useLenis";

// React Bits style Aurora background: slow-drifting blurred colour fields.
export default function Aurora() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (reducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray(".aurora-blob").forEach((el, i) => {
        gsap.to(el, {
          x: gsap.utils.random(-120, 120),
          y: gsap.utils.random(-80, 80),
          scale: gsap.utils.random(0.85, 1.25),
          duration: gsap.utils.random(9, 14),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: i * -2,
        });
      });
    }, ref);
    return () => ctx.revert();
  }, []);
  return (
    <div ref={ref} className="aurora" aria-hidden="true">
      <span className="aurora-blob b1" />
      <span className="aurora-blob b2" />
      <span className="aurora-blob b3" />
      <span className="aurora-grain" />
    </div>
  );
}
