import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { SecretError } from "@/lib/secrets/errors";
import { getServerEnvironment, getSupabaseServerClient } from "@/lib/supabase/server";
import { ciphertextSchema, ivSchema, type CreateSecretInput } from "@/lib/validation/secrets";
import type { Json } from "@/types/database";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function rateLimitKey(request: Request): string {
  // Only trust Vercel's overwritten edge header, never arbitrary X-Forwarded-For.
  const candidate = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : undefined;
  const subject = candidate && isIP(candidate) ? candidate : "shared-local-or-untrusted-edge";
  const hour = Math.floor(Date.now() / 3_600_000);
  return createHmac("sha256", getServerEnvironment().SUPABASE_SERVICE_ROLE_KEY)
    .update(`ghostkey:create:${hour}:${subject}`)
    .digest("hex");
}

const rpcStateSchema = z.object({ status: z.string(), retry_after: z.number().int().positive().optional() });
const metadataSchema = z.object({
  status: z.literal("available"),
  expires_at: z.iso.datetime({ offset: true }),
  max_views: z.number().int().min(0).max(100),
  view_count: z.number().int().min(0),
});
const payloadSchema = metadataSchema.extend({ ciphertext: ciphertextSchema, iv: ivSchema });
const createdSchema = z.object({ status: z.literal("created"), expires_at: z.iso.datetime({ offset: true }), max_views: z.number().int().min(0).max(100) });

function assertRpcState(data: Json | null, expected: string): void {
  const result = rpcStateSchema.safeParse(data);
  if (!result.success) throw new SecretError("INTERNAL_ERROR");
  if (result.data.status === expected) return;
  switch (result.data.status) {
    case "expired": throw new SecretError("SECRET_EXPIRED");
    case "consumed": throw new SecretError("SECRET_CONSUMED");
    case "not_found": throw new SecretError("SECRET_NOT_FOUND");
    case "forbidden": throw new SecretError("FORBIDDEN");
    case "invalid_request": throw new SecretError("INVALID_REQUEST");
    case "rate_limited": throw new SecretError("RATE_LIMITED", result.data.retry_after ?? 60);
    default: throw new SecretError("INTERNAL_ERROR");
  }
}

export async function createSecret(input: CreateSecretInput, request: Request) {
  const id = randomBytes(32).toString("base64url");
  const deletionToken = randomBytes(32).toString("base64url");
  const { data, error } = await getSupabaseServerClient().rpc("create_secret", {
    p_secret_hash: hashToken(id),
    p_deletion_token_hash: hashToken(deletionToken),
    p_ciphertext: input.ciphertext,
    p_iv: input.iv,
    p_expires_in: input.expiresIn,
    p_max_views: input.maxViews,
    p_rate_limit_key: rateLimitKey(request),
  });
  if (error) throw new SecretError("SERVICE_UNAVAILABLE");
  assertRpcState(data, "created");
  const created = createdSchema.parse(data);
  return { id, deletionToken, expiresAt: created.expires_at, maxViews: created.max_views };
}

export async function peekSecret(id: string) {
  const { data, error } = await getSupabaseServerClient().rpc("peek_secret", { p_secret_hash: hashToken(id) });
  if (error) throw new SecretError("SERVICE_UNAVAILABLE");
  assertRpcState(data, "available");
  const secret = metadataSchema.parse(data);
  return {
    expiresAt: secret.expires_at,
    maxViews: secret.max_views,
    viewCount: secret.view_count,
    remainingViews: secret.max_views === 0 ? null : secret.max_views - secret.view_count,
  };
}

export async function consumeSecret(id: string) {
  const { data, error } = await getSupabaseServerClient().rpc("consume_secret", { p_secret_hash: hashToken(id) });
  if (error) throw new SecretError("SERVICE_UNAVAILABLE");
  assertRpcState(data, "available");
  const secret = payloadSchema.parse(data);
  const remainingViews = secret.max_views === 0 ? null : Math.max(0, secret.max_views - secret.view_count);
  return {
    ciphertext: secret.ciphertext,
    iv: secret.iv,
    expiresAt: secret.expires_at,
    maxViews: secret.max_views,
    viewCount: secret.view_count,
    remainingViews,
    consumed: remainingViews === 0,
  };
}

export async function deleteSecret(id: string, deletionToken: string): Promise<void> {
  const { data, error } = await getSupabaseServerClient().rpc("delete_secret", {
    p_secret_hash: hashToken(id),
    p_deletion_token_hash: hashToken(deletionToken),
  });
  if (error) throw new SecretError("SERVICE_UNAVAILABLE");
  assertRpcState(data, "deleted");
}

