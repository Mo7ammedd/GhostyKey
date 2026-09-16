import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateTestDatabase, testPool } from "../support/database";

const pool = testPool();
const hash = () => createHash("sha256").update(randomBytes(32)).digest("hex");
type RpcResult = { status: string; ciphertext?: string; iv?: string; view_count?: number; max_views?: number; retry_after?: number };

async function fixture(maxViews = 1, expired = false) {
  const secretHash = hash();
  const deletionHash = hash();
  const ciphertext = randomBytes(64).toString("base64url");
  const iv = randomBytes(12).toString("base64url");
  await pool.query("insert into public.secrets (secret_hash, deletion_token_hash, ciphertext, iv, expires_at, max_views) values ($1, $2, $3, $4, clock_timestamp() + $5::interval, $6)", [secretHash, deletionHash, ciphertext, iv, expired ? "-1 second" : "1 hour", maxViews]);
  return { secretHash, deletionHash, ciphertext, iv };
}

async function consume(secretHash: string): Promise<RpcResult> {
  const result = await pool.query<{ result: RpcResult }>("select public.consume_secret($1) as result", [secretHash]);
  return result.rows[0]!.result;
}

async function countSecrets() {
  const result = await pool.query<{ count: number }>("select count(*)::integer as count from public.secrets");
  return result.rows[0]!.count;
}

async function asRole<T>(role: "anon" | "authenticated" | "service_role", action: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query(`set role ${role}`);
    return await action(client);
  } finally {
    await client.query("reset role");
    client.release();
  }
}

beforeAll(() => migrateTestDatabase(pool));
beforeEach(() => pool.query("truncate public.secrets, public.secret_tombstones, public.secret_rate_limits"));
afterAll(() => pool.end());

describe("atomic lifecycle against real PostgreSQL", () => {
  it("allows exactly one of 20 simultaneous consumers and immediately deletes the ciphertext", async () => {
    const secret = await fixture();
    const results = await Promise.all(Array.from({ length: 20 }, () => consume(secret.secretHash)));
    const successful = results.filter((result) => result.status === "available");
    expect(successful).toHaveLength(1);
    expect(successful[0]?.ciphertext).toBe(secret.ciphertext);
    expect(results.filter((result) => result.status === "consumed")).toHaveLength(19);
    expect(await countSecrets()).toBe(0);
    const receipt = (await pool.query("select * from public.secret_tombstones")).rows[0] as Record<string, unknown>;
    expect(Object.keys(receipt).sort()).toEqual(["retained_until", "secret_hash", "state"]);
  });

  it.each([5, 10])("enforces a %i-view limit under concurrent requests", async (limit) => {
    const secret = await fixture(limit);
    const results = await Promise.all(Array.from({ length: 25 }, () => consume(secret.secretHash)));
    const successful = results.filter((result) => result.status === "available");
    expect(successful).toHaveLength(limit);
    expect(successful.map((result) => result.view_count).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(Array.from({ length: limit }, (_, index) => index + 1));
    expect(await countSecrets()).toBe(0);
  });

  it("supports unlimited views until expiration", async () => {
    const secret = await fixture(0);
    const results = await Promise.all(Array.from({ length: 20 }, () => consume(secret.secretHash)));
    expect(results.every((result) => result.status === "available")).toBe(true);
    expect(await countSecrets()).toBe(1);
    expect((await pool.query("select view_count from public.secrets")).rows[0]?.view_count).toBe(20);
    await pool.query("update public.secrets set expires_at = clock_timestamp() - interval '1 second'");
    expect(await consume(secret.secretHash)).toEqual({ status: "expired" });
  });

  it("never spends a view or returns ciphertext during metadata checks", async () => {
    const secret = await fixture();
    for (let index = 0; index < 3; index++) {
      const result = await pool.query<{ result: RpcResult }>("select public.peek_secret($1) as result", [secret.secretHash]);
      expect(result.rows[0]?.result.status).toBe("available");
      expect(result.rows[0]?.result.view_count).toBe(0);
      expect(result.rows[0]?.result).not.toHaveProperty("ciphertext");
    }
    expect((await consume(secret.secretHash)).status).toBe("available");
  });

  it("rejects expired secrets and retains a safe expired status", async () => {
    const secret = await fixture(1, true);
    expect(await consume(secret.secretHash)).toEqual({ status: "expired" });
    expect(await consume(secret.secretHash)).toEqual({ status: "expired" });
    expect(await countSecrets()).toBe(0);
  });

  it("rechecks wall-clock expiration after waiting for a row lock", async () => {
    const secret = await fixture();
    const locker = await pool.connect();
    try {
      await locker.query("begin");
      await locker.query("update public.secrets set expires_at = clock_timestamp() + interval '150 milliseconds' where secret_hash = $1", [secret.secretHash]);
      const pending = consume(secret.secretHash);
      await new Promise((resolve) => setTimeout(resolve, 230));
      await locker.query("commit");
      expect(await pending).toEqual({ status: "expired" });
    } finally {
      await locker.query("rollback");
      locker.release();
    }
  });

  it("requires the creator's separate deletion capability", async () => {
    const secret = await fixture();
    const wrong = await pool.query<{ result: RpcResult }>("select public.delete_secret($1, $2) as result", [secret.secretHash, hash()]);
    expect(wrong.rows[0]?.result).toEqual({ status: "forbidden" });
    expect(await countSecrets()).toBe(1);
    const right = await pool.query<{ result: RpcResult }>("select public.delete_secret($1, $2) as result", [secret.secretHash, secret.deletionHash]);
    expect(right.rows[0]?.result).toEqual({ status: "deleted" });
    expect(await consume(secret.secretHash)).toEqual({ status: "consumed" });
    expect(await countSecrets()).toBe(0);
  });

  it("purges expired payloads, old receipts and expired rate buckets while retaining active secrets", async () => {
    await fixture(1, true);
    await fixture(1, false);
    await pool.query("insert into public.secret_tombstones values ($1, 'consumed', clock_timestamp() - interval '1 second')", [hash()]);
    await pool.query("insert into public.secret_rate_limits values ('old', 1, clock_timestamp() - interval '1 second')");
    await pool.query("select public.cleanup_expired_secrets()");
    expect(await countSecrets()).toBe(1);
    expect((await pool.query("select state from public.secret_tombstones")).rows).toEqual([{ state: "expired" }]);
    expect((await pool.query("select * from public.secret_rate_limits")).rows).toHaveLength(0);
  });

  it("applies the creation rate limit atomically", async () => {
    const rateKey = hash();
    const responses = await Promise.all(Array.from({ length: 35 }, async () => {
      const result = await pool.query<{ result: RpcResult }>("select public.create_secret($1, $2, $3, $4, 86400, 1, $5) as result", [hash(), hash(), randomBytes(64).toString("base64url"), randomBytes(12).toString("base64url"), rateKey]);
      return result.rows[0]!.result;
    }));
    expect(responses.filter((result) => result.status === "created")).toHaveLength(30);
    expect(responses.filter((result) => result.status === "rate_limited")).toHaveLength(5);
    expect(await countSecrets()).toBe(30);
  });
});

describe("database authorization", () => {
  it("enables RLS on every application table", async () => {
    const result = await pool.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class where oid in ('public.secrets'::regclass, 'public.secret_tombstones'::regclass, 'public.secret_rate_limits'::regclass)");
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it.each(["anon", "authenticated"] as const)("denies direct access and RPC execution to %s", async (role) => {
    await expect(asRole(role, (client) => client.query("select * from public.secrets"))).rejects.toMatchObject({ code: "42501" });
    await expect(asRole(role, (client) => client.query("select public.consume_secret($1)", [hash()]))).rejects.toMatchObject({ code: "42501" });
    await expect(asRole(role, (client) => client.query("select public.cleanup_expired_secrets()"))).rejects.toMatchObject({ code: "42501" });
  });

  it("allows service-role RPCs but denies direct table access and internal helpers", async () => {
    const secret = await fixture();
    const response = await asRole("service_role", (client) => client.query<{ result: RpcResult }>("select public.consume_secret($1) as result", [secret.secretHash]));
    expect(response.rows[0]?.result.status).toBe("available");
    await expect(asRole("service_role", (client) => client.query("select * from public.secrets"))).rejects.toMatchObject({ code: "42501" });
    await expect(asRole("service_role", (client) => client.query("select public.ghostkey_take_rate_limit('bypass', 100, 100)"))).rejects.toMatchObject({ code: "42501" });
  });
});
