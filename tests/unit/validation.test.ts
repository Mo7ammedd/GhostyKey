import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/lib/security/csp";
import { MAX_CIPHERTEXT_BYTES } from "@/lib/secrets/constants";
import { createSecretSchema, encryptionKeySchema, secretIdSchema } from "@/lib/validation/secrets";

const valid = { ciphertext: randomBytes(50).toString("base64url"), iv: randomBytes(12).toString("base64url"), expiresIn: 86_400, maxViews: 1 };

describe("strict input validation", () => {
  it("defaults to 24 hours and a single view", () => {
    expect(createSecretSchema.parse({ ciphertext: valid.ciphertext, iv: valid.iv })).toEqual(valid);
  });

  it.each([
    { plaintext: "never accepted" }, { key: "never accepted" }, { expiresIn: 0 }, { expiresIn: 2_592_001 },
    { expiresIn: 60.1 }, { maxViews: -1 }, { maxViews: 101 }, { maxViews: "1" },
    { iv: randomBytes(16).toString("base64url") }, { ciphertext: "not+url/safe" }, { ciphertext: "A".repeat(22) },
  ])("rejects invalid or unexpected fields: %j", (fields) => {
    expect(createSecretSchema.safeParse({ ...valid, ...fields }).success).toBe(false);
  });

  it("enforces the ciphertext size including the authentication tag", () => {
    expect(createSecretSchema.safeParse({ ...valid, ciphertext: randomBytes(MAX_CIPHERTEXT_BYTES).toString("base64url") }).success).toBe(true);
    expect(createSecretSchema.safeParse({ ...valid, ciphertext: randomBytes(MAX_CIPHERTEXT_BYTES + 1).toString("base64url") }).success).toBe(false);
  });

  it("accepts unlimited views and custom durations within bounds", () => {
    expect(createSecretSchema.safeParse({ ...valid, maxViews: 0, expiresIn: 60 }).success).toBe(true);
    expect(createSecretSchema.safeParse({ ...valid, maxViews: 100, expiresIn: 2_592_000 }).success).toBe(true);
  });

  it("rejects sequential, malformed and noncanonical IDs and keys", () => {
    expect(secretIdSchema.safeParse("1234").success).toBe(false);
    expect(secretIdSchema.safeParse(randomBytes(32).toString("base64url")).success).toBe(true);
    expect(encryptionKeySchema.safeParse("A".repeat(42) + "B").success).toBe(false);
    expect(secretIdSchema.safeParse("../" + "a".repeat(40)).success).toBe(false);
  });
});

describe("Content Security Policy", () => {
  it("requires nonces and excludes unsafe script/style directives in production", () => {
    const csp = buildContentSecurityPolicy("synthetic-nonce", false);
    expect(csp).toContain("'nonce-synthetic-nonce'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
  });
  it("allows the Next.js development debugger only in development", () => {
    expect(buildContentSecurityPolicy("test", true)).toContain("unsafe-eval");
  });
});

