import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Discovery Cockpit",
  description: "Discovery call support for independent consultants.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
