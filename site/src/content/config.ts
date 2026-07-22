import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Hand-authored, original evergreen content — not produced by the
// scripts/*.mjs pipeline. Add a new guide by dropping a .md file here.
const guides = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/guides" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.date(),
    updatedDate: z.date().optional()
  })
});

// Business Spotlight articles — three tiers:
//  - "basic": free foot-in-the-door outreach piece, also just genuine site
//    content. Produced without a business having paid for anything.
//  - "paid": the deliverable for the "Featured Business Spotlight" package
//    on /advertise/ — same article format, plus the business also gets
//    promoted into the homepage hero slot (see featured-business.json /
//    FeaturedBusiness.astro's optional spotlightSlug field).
//  - "vip": everything "paid" gets, plus embedded video (see `videos`
//    below) — YouTube and/or an Instagram Reel.
// Add a new spotlight by dropping a .md file here.
const spotlights = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/spotlights" }),
  schema: z.object({
    title: z.string(),
    businessName: z.string(),
    category: z.string(),
    tier: z.enum(["basic", "paid", "vip"]).default("basic"),
    description: z.string(),
    publishDate: z.date(),
    updatedDate: z.date().optional(),
    website: z.string().optional(),
    photo: z.string().optional(),
    // Match a real listing in places.json to cross-link — see
    // site.config.mjs's `places.categories[].slug` and each business's
    // `slug` field for the values to use here.
    directoryCategory: z.string().optional(),
    directorySlug: z.string().optional(),
    // VIP tier only: embedded video(s). `url` is the normal watch/share
    // link (youtube.com/watch?v=... or instagram.com/reel/...) — the page
    // derives the embed from it.
    videos: z.array(z.object({
      platform: z.enum(["youtube", "instagram"]),
      url: z.string(),
      caption: z.string().optional()
    })).optional()
  })
});

export const collections = { guides, spotlights };
