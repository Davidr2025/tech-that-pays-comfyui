import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// SITE_URL / BASE_PATH are injected by the deploy environment:
//  - Cloudflare Pages / Netlify / Vercel: SITE_URL=https://your-domain, BASE_PATH=/
//  - GitHub Pages (project site): SITE_URL=https://<user>.github.io, BASE_PATH=/<repo>/
const site = process.env.SITE_URL || "https://mississauga-insider.pages.dev";
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  site,
  base,
  trailingSlash: "ignore",
  integrations: [sitemap()],
  build: { format: "directory" }
});
