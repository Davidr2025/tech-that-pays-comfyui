/**
 * How a prepared email leaves the app. The default provider opens the consultant's own mail
 * client through a `mailto:` link: nothing is sent from here, no credentials are stored. A
 * provider that sends for real (SMTP) implements the same interface and returns `{kind:"sent"}`.
 */
import type { EmailContent } from "./reveal/export";

export interface EmailAttachment {
  filename: string;
  content: string | Uint8Array;
  contentType: string;
}

export interface EmailMessage extends EmailContent {
  to: string | null;
  /** Where the client's reply should go (the consultant). Used by providers that send. */
  replyTo?: string;
  /** Shown as the sender's name; the address is the server's. */
  fromName?: string;
  attachments?: EmailAttachment[];
  /** A calendar invitation, sent so mail apps can offer Accept/Decline. */
  calendar?: { method: "REQUEST"; content: string };
}

export type EmailDelivery = { kind: "compose"; href: string } | { kind: "sent" };

export interface EmailProvider {
  readonly id: "mailto" | "smtp";
  deliver(message: EmailMessage): Promise<EmailDelivery>;
}

/** Mail clients and browsers truncate or refuse very long mailto: links; stay well under ~2,000. */
export const MAILTO_MAX = 1900;

/** What counts as an address we will put in a header: no commas, spaces, quotes, angle brackets or control characters. */
export const SAFE_ADDRESS = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function mailtoHref({ to, subject, parts }: EmailMessage): string {
  const build = (kept: typeof parts) =>
    `mailto:${to && SAFE_ADDRESS.test(to) ? to : ""}?subject=${encodeURIComponent(subject.replace(/[\r\n]+/g, " "))}&body=${encodeURIComponent(kept.map((p) => p.text).join("\n\n"))}`;
  let kept = [...parts];
  let href = build(kept);
  for (let i = kept.length - 1; href.length > MAILTO_MAX && i >= 0; i--) {
    if (kept[i]!.droppable) {
      kept = kept.filter((_, j) => j !== i);
      href = build(kept);
    }
  }
  return href;
}

export const mailtoProvider: EmailProvider = {
  id: "mailto",
  deliver: async (message) => ({ kind: "compose", href: mailtoHref(message) }),
};
