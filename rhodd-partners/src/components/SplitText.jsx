import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { reducedMotion } from "../hooks/useLenis";

gsap.registerPlugin(ScrollTrigger);

// React Bits style SplitText, implemented with GSAP: words rise out of a mask.
export default function SplitText({
  text,
  as: Tag = "h2",
  className = "",
  delay = 0,
  stagger = 0.045,
  immediate = false, // true = animate on mount (hero); false = on scroll
}) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (reducedMotion()) return;
    const ctx = gsap.context(() => {
      const words = ref.current.querySelectorAll(".sw-inner");
      gsap.set(words, { yPercent: 110 });
      gsap.to(words, {
        yPercent: 0,
        duration: 0.9,
        ease: "power4.out",
        stagger,
        delay,
        scrollTrigger: immediate
          ? undefined
          : { trigger: ref.current, start: "top 85%", once: true },
      });
    }, ref);
    return () => ctx.revert();
  }, [text, delay, stagger, immediate]);

  return (
    <Tag ref={ref} className={className} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span className="sw" aria-hidden="true" key={i}>
          <span className="sw-inner">{w}</span>
          {" "}
        </span>
      ))}
    </Tag>
  );
}
