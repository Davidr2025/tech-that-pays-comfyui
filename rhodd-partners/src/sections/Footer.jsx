import { NAV } from "../config";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <a href="#top" className="logo">
          <span className="logo-mark">R</span>
          <span>
            Rhodd <em>Partners</em>
          </span>
        </a>
        <nav aria-label="Footer">
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>
        <small>© {new Date().getFullYear()} Rhodd Partners. All rights reserved.</small>
      </div>
    </footer>
  );
}
