# Rhodd Partners: marketing site

AI-transformation consultancy site (companies doing roughly $1M to $50M in revenue).
Vite + React, with:

- **GSAP** (+ ScrollTrigger): headline reveals, scrubbed progress line, count-up, magnetic buttons, aurora drift
- **Lenis**: smooth scrolling, driven by GSAP's ticker so ScrollTrigger stays in sync
- **React Bits style components** (`src/components/`: SplitText, CountUp, SpotlightCard, Magnet, Aurora, Marquee).
  React Bits is a copy-paste library, not an npm dependency; these are our own GSAP-based
  implementations of the same patterns.

```bash
npm install
npm run dev      # local
npm run build    # outputs dist/ (static; deploy anywhere)
```

## Edit content
Everything editable is in `src/config.js` (contact email, booking link, services, steps, FAQ).
`CONTACT_EMAIL` is a placeholder: replace it. The contact form opens the visitor's email app
(`mailto:`); wire it to GHL/Formspree when ready.

No fabricated stats or testimonials are included; add real case studies once you have them.
`prefers-reduced-motion` disables Lenis and the GSAP animations.

## Brand logos
`BRANDS` in `src/config.js` drives the "experience" strip. Put logo files in `public/logos/`.
It is framed as experience, not clients, and carries a disclaimer. Only add logos you may display.
