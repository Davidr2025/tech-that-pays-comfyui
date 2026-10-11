import { useState } from "react";
import { CONTACT_EMAIL, BOOKING_URL } from "../config";
import Aurora from "../components/Aurora";
import SplitText from "../components/SplitText";
import Reveal from "../components/Reveal";
import Magnet from "../components/Magnet";

export default function Contact() {
  const [sent, setSent] = useState(false);

  // No backend yet: the form opens the visitor's email client with the message pre-filled.
  const onSubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    const body = `Name: ${d.name}\nCompany: ${d.company}\nAnnual revenue: ${d.size}\n\n${d.message}`;
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      "Enquiry from " + d.company
    )}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };

  return (
    <section className="section section--dark contact" id="contact">
      <Aurora />
      <div className="wrap contact-grid">
        <div>
          <Reveal className="eyebrow">Let's talk</Reveal>
          <SplitText className="h2" text="Start with a conversation, not a proposal." />
          <Reveal as="p" className="lead" delay={0.1}>
            Thirty minutes, no pitch. We'll talk through where your team is with AI and whether we're
            the right partner. If we're not, we'll tell you.
          </Reveal>
          {BOOKING_URL && (
            <Reveal delay={0.2}>
              <Magnet>
                <a className="btn" href={BOOKING_URL} target="_blank" rel="noreferrer">
                  Pick a time →
                </a>
              </Magnet>
            </Reveal>
          )}
          <Reveal as="p" className="contact-mail" delay={0.3}>
            Or email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </Reveal>
        </div>
        <Reveal as="form" className="form" onSubmit={onSubmit} delay={0.15}>
          <label>
            Your name
            <input name="name" required autoComplete="name" />
          </label>
          <label>
            Company
            <input name="company" required autoComplete="organization" />
          </label>
          <label>
            Annual revenue
            <select name="size" defaultValue="$1M to $5M">
              <option>$1M to $5M</option>
              <option>$5M to $25M</option>
              <option>$25M+</option>
            </select>
          </label>
          <label>
            What would you like AI to change?
            <textarea name="message" rows="4" required />
          </label>
          <button className="btn" type="submit">
            Send enquiry →
          </button>
          {sent && <p className="form-note">Opening your email app… if nothing happens, write to {CONTACT_EMAIL}.</p>}
        </Reveal>
      </div>
    </section>
  );
}
