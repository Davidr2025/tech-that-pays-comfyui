import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { reducedMotion } from "../hooks/useLenis";

gsap.registerPlugin(ScrollTrigger);

// Fades/lifts children in as they enter the viewport. `stagger` animates direct children.
export default function Reveal({ children, className = "", stagger = 0, delay = 0, as: Tag = "div", ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (reducedMotion()) return;
    const ctx = gsap.context(() => {
      const targets = stagger ? ref.current.children : ref.current;
      gsap.from(targets, {
        y: 36,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger,
        delay,
        scrollTrigger: { trigger: ref.current, start: "top 88%", once: true },
      });
    }, ref);
    return () => ctx.revert();
  }, [stagger, delay]);
  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}
