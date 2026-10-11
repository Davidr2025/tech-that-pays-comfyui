import { useEffect, useState } from "react";
import { NAV } from "../config";
import Magnet from "../components/Magnet";

export default function Nav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`nav ${solid ? "nav--solid" : ""} ${open ? "nav--open" : ""}`}>
      <div className="wrap nav-inner">
        <a href="#top" className="logo" aria-label="Rhodd Partners — home">
          <span className="logo-mark">R</span>
          <span>
            Rhodd <em>Partners</em>
          </span>
        </a>
        <nav className="nav-links" aria-label="Primary">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)}>
              {n.label}
            </a>
          ))}
        </nav>
        <Magnet strength={0.25}>
          <a href="#contact" className="btn btn--sm">
            Book a call
          </a>
        </Magnet>
        <button className="burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
