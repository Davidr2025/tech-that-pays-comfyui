import { defineConfig } from "prisma/config";

export default defineConfig({
  // scripts/prisma.mjs points this at a generated Postgres copy when DATABASE_URL is a Postgres URL.
  schema: process.env.PRISMA_SCHEMA ?? "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
