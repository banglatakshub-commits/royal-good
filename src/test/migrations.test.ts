import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";

const migrationsFolder = path.resolve(__dirname, "../../drizzle/migrations");
const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")) as {
  entries: { idx: number; tag: string }[];
};

describe("Drizzle migrations", () => {
  it("has a SQL file for every journal entry so the startup migration can run", () => {
    // `bun run start` runs drizzle-kit migrate before the server boots. A journal entry
    // without its .sql file makes that step exit with code 1 and the deploy crash-loops.
    const migrations = readMigrationFiles({ migrationsFolder });

    expect(migrations).toHaveLength(journal.entries.length);
  });

  it("has a snapshot for every journal entry so future generated migrations diff correctly", () => {
    for (const entry of journal.entries) {
      const prefix = String(entry.idx).padStart(4, "0");

      expect(existsSync(`${migrationsFolder}/meta/${prefix}_snapshot.json`), entry.tag).toBe(true);
    }
  });
});
