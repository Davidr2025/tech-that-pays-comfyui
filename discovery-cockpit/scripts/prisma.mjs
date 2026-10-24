#!/usr/bin/env node
// Runs the Prisma CLI with a default DATABASE_URL so the project works with no .env file.
// Override by exporting DATABASE_URL (e.g. a Postgres URL) before running any npm script.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL ??= `file:${path.join(root, "prisma", "dev.db")}`;

const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
const result = spawnSync(bin, process.argv.slice(2), { stdio: "inherit", cwd: root, env: process.env });
process.exit(result.status ?? 1);
