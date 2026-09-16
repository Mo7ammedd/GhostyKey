// Test-only PostgREST-compatible transport. The application still calls its real
// Supabase SDK, Route Handlers and migrated PostgreSQL functions. Never deployed.
import { createServer } from "node:http";
import { migrateTestDatabase, testPool } from "./database.ts";

const pool = testPool();
await migrateTestDatabase(pool);
const signatures = {
  create_secret: ["p_secret_hash", "p_deletion_token_hash", "p_ciphertext", "p_iv", "p_expires_in", "p_max_views", "p_rate_limit_key"],
  peek_secret: ["p_secret_hash"],
  consume_secret: ["p_secret_hash"],
  delete_secret: ["p_secret_hash", "p_deletion_token_hash"],
};

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/health") { response.end('{"ready":true}'); return; }
  const name = request.url?.split("/").at(-1);
  if (request.method !== "POST" || !request.url?.startsWith("/rest/v1/rpc/") || !Object.hasOwn(signatures, name ?? "")) {
    response.writeHead(404).end("{}"); return;
  }
  if (request.headers.authorization !== "Bearer ghostkey-e2e-service-key" || request.headers.apikey !== "ghostkey-e2e-service-key") {
    response.writeHead(403).end("{}"); return;
  }
  let body = "";
  try {
    for await (const chunk of request) {
      body += chunk.toString();
      if (body.length > 1_500_000) { response.writeHead(413).end("{}"); return; }
    }
    const args = JSON.parse(body);
    const names = signatures[name];
    const client = await pool.connect();
    try {
      await client.query("set role service_role");
      const placeholders = names.map((_, index) => `$${index + 1}`).join(", ");
      const result = await client.query(`select public.${name}(${placeholders}) as data`, names.map((key) => args[key]));
      response.end(JSON.stringify(result.rows[0].data));
    } finally {
      await client.query("reset role");
      client.release();
    }
  } catch {
    response.writeHead(500).end('{"code":"TEST_TRANSPORT_ERROR","message":"Test database request failed."}');
  }
});

server.listen(54329, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { server.close(() => { void pool.end().then(() => process.exit(0)); }); });
}

