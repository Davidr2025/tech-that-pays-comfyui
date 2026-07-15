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

export const collections = { guides };
