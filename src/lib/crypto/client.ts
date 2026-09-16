import "client-only";

import { fromBase64Url, toBase64Url } from "@/lib/crypto/encoding";
import { MAX_SECRET_BYTES } from "@/lib/secrets/constants";
import { ciphertextSchema, encryptionKeySchema, ivSchema } from "@/lib/validation/secrets";

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure encryption is unavailable. Open GhostKey over HTTPS in a modern browser.");
  }
  return globalThis.crypto;
}

export async function encryptSecret(plaintext: string): Promise<{ ciphertext: string; iv: string; key: string }> {
  const data = new TextEncoder().encode(plaintext);
  if (data.length === 0 || data.length > MAX_SECRET_BYTES) {
    throw new Error("Enter a secret between 1 byte and 1 MB.");
  }

  const webCrypto = getCrypto();
  const key = await webCrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = webCrypto.getRandomValues(new Uint8Array(12));

  try {
    const encrypted = await webCrypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, data);
    const rawKey = new Uint8Array(await webCrypto.subtle.exportKey("raw", key));
    try {
      return { ciphertext: toBase64Url(new Uint8Array(encrypted)), iv: toBase64Url(iv), key: toBase64Url(rawKey) };
    } finally {
      rawKey.fill(0);
    }
  } finally {
    data.fill(0);
  }
}

export async function importDecryptionKey(encodedKey: string): Promise<CryptoKey> {
  if (!encryptionKeySchema.safeParse(encodedKey).success) throw new Error("The encryption key is missing or invalid.");
  const rawKey = fromBase64Url(encodedKey);
  try {
    return await getCrypto().subtle.importKey("raw", rawKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  } finally {
    rawKey.fill(0);
  }
}

export async function decryptSecret(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
  if (!ciphertextSchema.safeParse(ciphertext).success || !ivSchema.safeParse(iv).success) {
    throw new Error("This encrypted payload is not valid.");
  }
  const plaintext = new Uint8Array(await getCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv), tagLength: 128 },
    key,
    fromBase64Url(ciphertext),
  ));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } finally {
    plaintext.fill(0);
  }
}

