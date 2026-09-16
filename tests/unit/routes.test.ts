import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/secrets/route";
import { DELETE, GET, HEAD } from "@/app/api/secrets/[id]/route";
import { MAX_REQUEST_BYTES, REVEAL_HEADER } from "@/lib/secrets/constants";
import { SecretError } from "@/lib/secrets/errors";
import * as service from "@/lib/secrets/server";

vi.mock("@/lib/secrets/server", () => ({ createSecret: vi.fn(), consumeSecret: vi.fn(), peekSecret: vi.fn(), deleteSecret: vi.fn() }));

const id = randomBytes(32).toString("base64url");
const deletionToken = randomBytes(32).toString("base64url");
const context = { params: Promise.resolve({ id }) };
const origin = "https://ghostkey.test";
const valid = { ciphertext: randomBytes(60).toString("base64url"), iv: randomBytes(12).toString("base64url"), expiresIn: 86_400, maxViews: 1 };
const metadata = { expiresAt: new Date(Date.now() + 86_400_000).toISOString(), maxViews: 1, viewCount: 0, remainingViews: 1 };

function post(body: string, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/secrets`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...headers }, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(service.createSecret).mockResolvedValue({ id, deletionToken, expiresAt: metadata.expiresAt, maxViews: 1 });
  vi.mocked(service.peekSecret).mockResolvedValue(metadata);
  vi.mocked(service.consumeSecret).mockResolvedValue({ ...valid, ...metadata, viewCount: 1, remainingViews: 0, consumed: true });
  vi.mocked(service.deleteSecret).mockResolvedValue(undefined);
});

describe("creation API", () => {
  it("creates an encrypted secret with private no-store headers", async () => {
    const response = await POST(post(JSON.stringify(valid)));
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual({ id, deletionToken, expiresAt: metadata.expiresAt, maxViews: 1 });
    expect(service.createSecret).toHaveBeenCalledWith(valid, expect.any(Request));
  });

  it("rejects plaintext fields, broken JSON, and cross-origin requests before database access", async () => {
    expect((await POST(post(JSON.stringify({ ...valid, plaintext: "synthetic" })))).status).toBe(400);
    expect((await POST(post("{ broken"))).status).toBe(400);
    expect((await POST(post(JSON.stringify(valid), { Origin: "https://untrusted.test" }))).status).toBe(403);
    expect(service.createSecret).not.toHaveBeenCalled();
  });

  it("validates the browser-facing Host when Next.js normalizes the internal URL", async () => {
    const request = new Request("http://localhost:3105/api/secrets", {
      method: "POST", body: JSON.stringify(valid),
      headers: { "Content-Type": "application/json", Host: "127.0.0.1:3105", Origin: "http://127.0.0.1:3105", "Sec-Fetch-Site": "same-origin" },
    });
    expect((await POST(request)).status).toBe(201);
    const forged = new Request("http://localhost:3105/api/secrets", {
      method: "POST", body: JSON.stringify(valid),
      headers: { "Content-Type": "application/json", Host: "127.0.0.1:3105", Origin: "https://untrusted.test", "X-Forwarded-Host": "untrusted.test" },
    });
    expect((await POST(forged)).status).toBe(403);
  });

  it("bounds the actual request body even when Content-Length is absent or dishonest", async () => {
    const oversized = "a".repeat(MAX_REQUEST_BYTES + 1);
    const headerCases: Record<string, string>[] = [{}, { "Content-Length": "1" }, { "Content-Length": String(MAX_REQUEST_BYTES + 1) }];
    for (const headers of headerCases) {
      const response = await POST(post(oversized, headers));
      expect(response.status).toBe(413);
      expect((await response.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
    }
    expect(service.createSecret).not.toHaveBeenCalled();
  });

  it("sanitizes internal exceptions and supplies a retry delay for rate limits", async () => {
    vi.mocked(service.createSecret).mockRejectedValueOnce(new Error("sensitive-provider-details"));
    const response = await POST(post(JSON.stringify(valid)));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("sensitive-provider-details");
    vi.mocked(service.createSecret).mockRejectedValueOnce(new SecretError("RATE_LIMITED", 120));
    const limited = await POST(post(JSON.stringify(valid)));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("120");
  });
});

describe("retrieval and deletion API", () => {
  it("makes preview and metadata requests non-consuming", async () => {
    const url = `${origin}/api/secrets/${id}`;
    expect((await GET(new Request(url), context)).status).toBe(400);
    const response = await HEAD(new Request(url, { method: "HEAD" }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Secret-Remaining-Views")).toBe("1");
    expect(await response.text()).toBe("");
    expect(service.consumeSecret).not.toHaveBeenCalled();
    expect(service.peekSecret).toHaveBeenCalledOnce();
  });

  it("consumes only after an explicit same-origin reveal and rejects bad IDs", async () => {
    const request = new Request(`${origin}/api/secrets/${id}`, { headers: { [REVEAL_HEADER]: "1" } });
    expect((await GET(request, context)).status).toBe(200);
    expect(service.consumeSecret).toHaveBeenCalledWith(id);
    const invalid = await GET(request, { params: Promise.resolve({ id: "sequential-1" }) });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("INVALID_SECRET_ID");
  });

  it.each(["SECRET_EXPIRED", "SECRET_CONSUMED", "SECRET_NOT_FOUND"] as const)("returns a structured %s response", async (code) => {
    vi.mocked(service.consumeSecret).mockRejectedValueOnce(new SecretError(code));
    const response = await GET(new Request(`${origin}/api/secrets/${id}`, { headers: { [REVEAL_HEADER]: "1" } }), context);
    expect(response.status).toBe(code === "SECRET_NOT_FOUND" ? 404 : 410);
    expect((await response.json()).error.code).toBe(code);
  });

  it("requires a separate bearer capability for deletion", async () => {
    const url = `${origin}/api/secrets/${id}`;
    expect((await DELETE(new Request(url, { method: "DELETE" }), context)).status).toBe(403);
    expect(service.deleteSecret).not.toHaveBeenCalled();
    const response = await DELETE(new Request(url, { method: "DELETE", headers: { Authorization: `Bearer ${deletionToken}` } }), context);
    expect(response.status).toBe(204);
    expect(service.deleteSecret).toHaveBeenCalledWith(id, deletionToken);
  });
});
