#!/usr/bin/env node
// Runs the Prisma CLI with a default DATABASE_URL so the project works with no .env file.
//
// Two databases are supported from ONE schema file:
//   SQLite    (default, zero setup)   uses prisma/schema.prisma and prisma/migrations as they are.
//   Postgres  (DATABASE_URL=postgres://… or postgresql://…, e.g. a hosted deployment) uses a generated copy of the
//             schema with the provider swapped, and `db push` instead of the SQLite migration files.
//
// `node scripts/prisma.mjs deploy` brings whichever database DATABASE_URL names up to date.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL ??= `file:${path.join(root, "prisma", "dev.db")}`;
const postgres = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL);

if (postgres) {
  const source = fs.readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
  const swapped = source.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  if (swapped === source) throw new Error("Could not find the sqlite provider line in prisma/schema.prisma.");
  const dir = path.join(root, "prisma", "postgres");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "schema.prisma"), `// GENERATED from ../schema.prisma by scripts/prisma.mjs. Do not edit.\n${swapped}`);
  process.env.PRISMA_SCHEMA = "prisma/postgres/schema.prisma";
}

let args = process.argv.slice(2);
if (args[0] === "deploy") args = postgres ? ["db", "push", "--skip-generate"] : ["migrate", "deploy"];
else if (postgres && args[0] === "migrate") {
  console.error("Migrations in prisma/migrations are for SQLite. For Postgres run: node scripts/prisma.mjs deploy");
  process.exit(1);
}

const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
const result = spawnSync(bin, args, { stdio: "inherit", cwd: root, env: process.env });
process.exit(result.status ?? 1);
