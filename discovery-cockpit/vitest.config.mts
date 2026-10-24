import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(root, "src") } },
  test: {
    environment: "node",
    // Tests never touch the dev database: they get their own file, migrated in global-setup.
    env: { DATABASE_URL: `file:${path.resolve(root, "prisma", "test.db")}` },
    include: ["tests/**/*.test.{ts,tsx}"],
    globalSetup: ["tests/global-setup.ts"],
    // The privacy/integration tests share one SQLite file, so run test files serially.
    fileParallelism: false,
  },
});
