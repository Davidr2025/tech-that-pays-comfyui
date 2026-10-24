/**
 * Sending email for real, through the operator's SMTP server (nodemailer), behind the same
 * `EmailProvider` interface as the mailto: draft. Configure with environment variables:
 *
 *   SMTP_HOST   required        SMTP_PORT   587 (465 means implicit TLS)
 *   SMTP_FROM   required, e.g. "reviews@yourdomain.com"
 *   SMTP_USER / SMTP_PASS       both or neither
 *   SMTP_SECURE "true" for implicit TLS on a port other than 465
 *
 * Without SMTP_HOST and SMTP_FROM the app falls back to mailto: drafts. Credentials live in the
 * environment only: never in the database, the repository, or any response.
 *
 * STARTTLS is required for any host that is not loopback, so credentials and reviews never cross a
 * network in the clear. The sender address is always the operator's; the consultant is the Reply-To.
 */
import nodemailer from "nodemailer";
import { type EmailDelivery, type EmailMessage, type EmailProvider, SAFE_ADDRESS } from "../lib/email";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  fromAddress: string;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** `a@b.co` or `Name <a@b.co>`: returns the address, or null if it is not one we trust in a header. */
function parseAddress(raw: string): string | null {
  const m = raw.trim().match(/<([^<>]+)>$/);
  const addr = (m ? m[1]! : raw).trim();
  return SAFE_ADDRESS.test(addr) ? addr : null;
}

export function smtpConfig(env: Record<string, string | undefined> = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const fromAddress = env.SMTP_FROM ? parseAddress(env.SMTP_FROM) : null;
  if (!host || !fromAddress) return null;
  const port = env.SMTP_PORT?.trim() ? Number(env.SMTP_PORT) : 587;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const user = env.SMTP_USER?.trim() || null;
  const pass = env.SMTP_PASS || null;
  if (Boolean(user) !== Boolean(pass)) return null; // half a login is a misconfiguration, not a reason to send unauthenticated
  return { host, port, secure: port === 465 || env.SMTP_SECURE?.trim().toLowerCase() === "true", user, pass, fromAddress };
}

export const emailMode = (env: Record<string, string | undefined> = process.env): "smtp" | "mailto" => (smtpConfig(env) ? "smtp" : "mailto");

export class EmailSendError extends Error {}

/** Transport options, exported so tests can check the security-relevant ones without a network. */
export function transportOptions(cfg: SmtpConfig) {
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: !cfg.secure && !LOOPBACK.has(cfg.host.toLowerCase()),
    ...(cfg.user && cfg.pass ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: { rejectUnauthorized: true },
  };
}

const cleanName = (s: string) => s.replace(/[\u0000-\u001f\u007f"<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);

export function smtpProvider(cfg: SmtpConfig): EmailProvider {
  return {
    id: "smtp",
    async deliver(message: EmailMessage): Promise<EmailDelivery> {
      if (!message.to || !SAFE_ADDRESS.test(message.to)) throw new EmailSendError("There is no valid email address to send to.");
      if (message.replyTo && !SAFE_ADDRESS.test(message.replyTo)) throw new EmailSendError("The reply-to address is not valid.");
      const transport = nodemailer.createTransport(transportOptions(cfg));
      try {
        await transport.sendMail({
          from: { name: cleanName(message.fromName ?? "") || cfg.fromAddress, address: cfg.fromAddress },
          to: message.to,
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          subject: message.subject.replace(/[\r\n]+/g, " ").trim(),
          text: message.parts.map((p) => p.text).join("\n\n"),
          attachments: (message.attachments ?? []).map((a) => ({ filename: a.filename.replace(/[^A-Za-z0-9._-]/g, "_"), content: typeof a.content === "string" ? a.content : Buffer.from(a.content), contentType: a.contentType })),
          ...(message.calendar ? { icalEvent: { method: message.calendar.method, content: message.calendar.content } } : {}),
        });
      } catch (err) {
        // Log the cause for the operator; never return it (it can include the server's greeting or the login name).
        console.error("SMTP send failed", err);
        throw new EmailSendError("The mail server did not accept the message.");
      } finally {
        transport.close();
      }
      return { kind: "sent" };
    },
  };
}
