import "client-only";

import { z } from "zod";
import { encryptSecret } from "@/lib/crypto/client";
import { REVEAL_HEADER } from "@/lib/secrets/constants";
import { isSecretErrorCode, SecretError } from "@/lib/secrets/errors";
import { createSecretResponseSchema, encryptedSecretResponseSchema } from "@/lib/validation/secrets";
import type { SecretMetadata, SecretResult } from "@/types/secrets";

const errorSchema = z.object({ error: z.object({ code: z.string() }) });

async function assertSuccessful(response: Response): Promise<void> {
  if (response.ok) return;
  const headerCode = response.headers.get("X-Secret-State");
  if (isSecretErrorCode(headerCode)) throw new SecretError(headerCode);
  const result = errorSchema.safeParse(await response.json().catch(() => null));
  const code = result.success ? result.data.error.code : undefined;
  throw new SecretError(isSecretErrorCode(code) ? code : "INTERNAL_ERROR");
}

export async function createSecureLink(plaintext: string, expiresIn: number, maxViews: number): Promise<SecretResult> {
  const encrypted = await encryptSecret(plaintext);
  const response = await fetch("/api/secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Intentionally enumerate fields: never serialize the key or plaintext.
    body: JSON.stringify({ ciphertext: encrypted.ciphertext, iv: encrypted.iv, expiresIn, maxViews }),
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
  });
  await assertSuccessful(response);
  const secret = createSecretResponseSchema.parse(await response.json());
  return { ...secret, url: `${window.location.origin}/s/${secret.id}#${encrypted.key}` };
}

const metadataSchema = z.object({
  expiresAt: z.iso.datetime({ offset: true }),
  maxViews: z.number().int().min(0).max(100),
  viewCount: z.number().int().min(0),
  remainingViews: z.number().int().min(1).nullable(),
});

export async function getSecretMetadata(id: string, signal?: AbortSignal): Promise<SecretMetadata> {
  const response = await fetch(`/api/secrets/${encodeURIComponent(id)}`, {
    method: "HEAD", cache: "no-store", credentials: "omit", redirect: "error", signal,
  });
  await assertSuccessful(response);
  const remaining = response.headers.get("X-Secret-Remaining-Views");
  return metadataSchema.parse({
    expiresAt: response.headers.get("X-Secret-Expires-At"),
    maxViews: Number(response.headers.get("X-Secret-Max-Views")),
    viewCount: Number(response.headers.get("X-Secret-View-Count")),
    remainingViews: remaining === "unlimited" ? null : Number(remaining),
  });
}

export async function consumeEncryptedSecret(id: string) {
  const response = await fetch(`/api/secrets/${encodeURIComponent(id)}`, {
    headers: { [REVEAL_HEADER]: "1" },
    cache: "no-store", credentials: "omit", redirect: "error",
  });
  await assertSuccessful(response);
  return encryptedSecretResponseSchema.parse(await response.json());
}

export async function revokeSecret(id: string, deletionToken: string): Promise<void> {
  const response = await fetch(`/api/secrets/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${deletionToken}` },
    cache: "no-store", credentials: "omit", redirect: "error",
  });
  await assertSuccessful(response);
}

