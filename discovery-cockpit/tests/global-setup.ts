import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

/** Builds a fresh, fully migrated SQLite file for the test run. */
export default function setup() {
  const dbFile = path.join(root, "prisma", "test.db");
  for (const f of [dbFile, `${dbFile}-journal`]) fs.rmSync(f, { force: true });

  const result = spawnSync("node", ["scripts/prisma.mjs", "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Could not migrate the test database:\n${result.stdout}\n${result.stderr}`);
  }

  return () => {
    fs.rmSync(dbFile, { force: true });
  };
}
