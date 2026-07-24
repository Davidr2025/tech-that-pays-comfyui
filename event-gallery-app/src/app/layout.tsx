import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Event Gallery — QR photo & video sharing for your events",
  description:
    "Guests scan a QR code and instantly share photos and videos to a live event gallery. No app required.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
