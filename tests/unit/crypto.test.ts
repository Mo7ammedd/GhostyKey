import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret, importDecryptionKey } from "@/lib/crypto/client";
import { fromBase64Url, toBase64Url } from "@/lib/crypto/encoding";
import { createSecureLink } from "@/lib/secrets/client";
import { MAX_SECRET_BYTES } from "@/lib/secrets/constants";

describe("browser encryption", () => {
  it("round-trips Unicode, whitespace and markup without executing or normalizing it", async () => {
    const plaintext = "  A test secret 🔑\nكلمة مرور\n<script>alert('inert')</script>\t ";
    const encrypted = await encryptSecret(plaintext);
    const key = await importDecryptionKey(encrypted.key);
    expect(await decryptSecret(encrypted.ciphertext, encrypted.iv, key)).toBe(plaintext);
    expect(fromBase64Url(encrypted.key)).toHaveLength(32);
    expect(fromBase64Url(encrypted.iv)).toHaveLength(12);
    expect(key.extractable).toBe(false);
    expect(fromBase64Url(encrypted.ciphertext)).toHaveLength(new TextEncoder().encode(plaintext).length + 16);
  });

  it("uses fresh random keys, IVs and ciphertext for identical input", async () => {
    const first = await encryptSecret("synthetic-test-only");
    const second = await encryptSecret("synthetic-test-only");
    expect(first.key).not.toBe(second.key);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects tampering, a wrong key, and malformed key material", async () => {
    const first = await encryptSecret("synthetic-test-only");
    const second = await encryptSecret("another synthetic secret");
    const tampered = fromBase64Url(first.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    const key = await importDecryptionKey(first.key);
    await expect(decryptSecret(toBase64Url(tampered), first.iv, key)).rejects.toThrow();
    await expect(decryptSecret(first.ciphertext, first.iv, await importDecryptionKey(second.key))).rejects.toThrow();
    await expect(importDecryptionKey("invalid")).rejects.toThrow();
  });

  it("accepts exactly 1 MiB and checks UTF-8 bytes rather than character counts", async () => {
    const plaintext = "é".repeat(MAX_SECRET_BYTES / 2);
    const encrypted = await encryptSecret(plaintext);
    expect(await decryptSecret(encrypted.ciphertext, encrypted.iv, await importDecryptionKey(encrypted.key))).toBe(plaintext);
    await expect(encryptSecret(`${plaintext}é`)).rejects.toThrow();
    await expect(encryptSecret("")).rejects.toThrow();
  });

  it("sends only encrypted fields to the API and puts the key exclusively in the fragment", async () => {
    const id = randomBytes(32).toString("base64url");
    const deletionToken = randomBytes(32).toString("base64url");
    const request = vi.fn().mockResolvedValue(Response.json({ id, deletionToken, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), maxViews: 1 }));
    vi.stubGlobal("fetch", request);
    vi.stubGlobal("window", { location: { origin: "https://ghostkey.test" } });
    const plaintext = "synthetic-client-boundary-test-🔑";
    const result = await createSecureLink(plaintext, 86_400, 1);
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { ciphertext: string; iv: string; expiresIn: number; maxViews: number };
    const link = new URL(result.url);
    expect(url).toBe("/api/secrets");
    expect(Object.keys(body).sort()).toEqual(["ciphertext", "expiresIn", "iv", "maxViews"]);
    expect(String(init.body)).not.toContain(plaintext);
    expect(String(init.body)).not.toContain(link.hash.slice(1));
    expect(link.search).toBe("");
    expect(link.pathname).toBe(`/s/${id}`);
    expect(link.hash.slice(1)).toHaveLength(43);
    expect(link.href).not.toContain(deletionToken);
    expect(await decryptSecret(body.ciphertext, body.iv, await importDecryptionKey(link.hash.slice(1)))).toBe(plaintext);
  });
});

