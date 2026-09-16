import { z } from "zod";
import {
  DEFAULT_EXPIRATION_SECONDS,
  DEFAULT_MAX_VIEWS,
  GCM_TAG_BYTES,
  MAX_CIPHERTEXT_BYTES,
  MAX_CIPHERTEXT_LENGTH,
  MAX_EXPIRATION_SECONDS,
  MIN_EXPIRATION_SECONDS,
} from "@/lib/secrets/constants";

// Unpadded, canonical base64url. Reject unused nonzero bits as well as invalid lengths.
export function isCanonicalBase64Url(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return false;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const last = alphabet.indexOf(value.at(-1) ?? "");
  return value.length % 4 === 2 ? (last & 15) === 0 : value.length % 4 === 3 ? (last & 3) === 0 : true;
}

const tokenSchema = z.string().length(43).refine(isCanonicalBase64Url);
export const secretIdSchema = tokenSchema;
export const deletionTokenSchema = tokenSchema;
export const encryptionKeySchema = tokenSchema;
export const ivSchema = z.string().length(16).refine(isCanonicalBase64Url);
export const ciphertextSchema = z.string()
  .min(Math.ceil(((GCM_TAG_BYTES + 1) * 4) / 3))
  .max(MAX_CIPHERTEXT_LENGTH)
  .refine(isCanonicalBase64Url)
  .refine((value) => Math.floor((value.length * 3) / 4) <= MAX_CIPHERTEXT_BYTES);

export const createSecretSchema = z.object({
  ciphertext: ciphertextSchema,
  iv: ivSchema,
  expiresIn: z.number().int().min(MIN_EXPIRATION_SECONDS).max(MAX_EXPIRATION_SECONDS).default(DEFAULT_EXPIRATION_SECONDS),
  maxViews: z.number().int().min(0).max(100).default(DEFAULT_MAX_VIEWS),
}).strict();

export const createSecretResponseSchema = z.object({
  id: secretIdSchema,
  deletionToken: deletionTokenSchema,
  expiresAt: z.iso.datetime({ offset: true }),
  maxViews: z.number().int().min(0).max(100),
});

export const encryptedSecretResponseSchema = z.object({
  ciphertext: ciphertextSchema,
  iv: ivSchema,
  expiresAt: z.iso.datetime({ offset: true }),
  maxViews: z.number().int().min(0).max(100),
  viewCount: z.number().int().min(1),
  remainingViews: z.number().int().min(0).nullable(),
  consumed: z.boolean(),
});

export type CreateSecretInput = z.infer<typeof createSecretSchema>;
export type CreatedSecret = z.infer<typeof createSecretResponseSchema>;
export type EncryptedSecret = z.infer<typeof encryptedSecretResponseSchema>;

