import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const output = fileURLToPath(new URL("../supabase/setup.sql", import.meta.url));
const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
const sections = [
  "-- GhostKey first-time database setup. Run once in the Supabase SQL Editor.",
  "-- Generated from supabase/migrations; regenerate with npm run db:setup:sql.",
  "-- Contains schema and functions only. No credentials or secret payloads.",
  "begin;",
];
for (const name of names) {
  sections.push(`-- Migration: ${name}`, await readFile(`${directory}/${name}`, "utf8"));
}
sections.push("notify pgrst, 'reload schema';", "commit;", "");
await writeFile(output, sections.join("\n\n"));
process.stdout.write("Created supabase/setup.sql. Run its contents in your Supabase SQL Editor.\n");
