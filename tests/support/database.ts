import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

export function testPool() {
  const connectionString = process.env.GHOSTKEY_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Use npm run test:db or npm run test:e2e to start an isolated database.");
  const parsed = new URL(connectionString);
  if (parsed.hostname !== "127.0.0.1" || parsed.username !== "ghostkey_test") throw new Error("Refusing to use a non-test database.");
  return new Pool({ connectionString, max: 30 });
}

export async function migrateTestDatabase(pool: Pool) {
  await pool.query("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role;");
  const directory = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
  for (const name of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
    await pool.query(await readFile(`${directory}/${name}`, "utf8"));
  }
}

