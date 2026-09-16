import "server-only";

import { MAX_REQUEST_BYTES } from "@/lib/secrets/constants";
import { ERROR_DEFINITIONS, SecretError } from "@/lib/secrets/errors";
import { secretIdSchema } from "@/lib/validation/secrets";

export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function jsonResponse(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(PRIVATE_HEADERS);
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  return Response.json(body, { status, headers });
}

export function errorResponse(error: unknown, head = false): Response {
  // Never serialize, log, or forward raw exceptions, validation input, or DB errors.
  const safeError = error instanceof SecretError ? error : new SecretError("INTERNAL_ERROR");
  const definition = ERROR_DEFINITIONS[safeError.code];
  const headers = new Headers(PRIVATE_HEADERS);
  headers.set("X-Secret-State", safeError.code);
  if (safeError.retryAfter) headers.set("Retry-After", String(safeError.retryAfter));
  return head
    ? new Response(null, { status: definition.status, headers })
    : jsonResponse({ error: { code: safeError.code, message: definition.message } }, definition.status, headers);
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new SecretError("FORBIDDEN");
  }
  if (!origin) return; // Non-browser API clients do not necessarily send Origin.
  const requestUrl = new URL(request.url);
  const forwardedProtocol = process.env.VERCEL === "1" ? request.headers.get("x-forwarded-proto") : null;
  const protocol = forwardedProtocol === "https" || forwardedProtocol === "http" ? `${forwardedProtocol}:` : requestUrl.protocol;
  // Next.js can normalize loopback/internal request URLs. Host identifies the
  // browser-facing authority and cannot be overridden by cross-origin browser JS.
  const host = request.headers.get("host") ?? requestUrl.host;
  try {
    if (origin !== new URL(`${protocol}//${host}`).origin) throw new SecretError("FORBIDDEN");
  } catch {
    throw new SecretError("FORBIDDEN");
  }
}

export function validateSecretId(id: string): string {
  if (!secretIdSchema.safeParse(id).success) throw new SecretError("INVALID_SECRET_ID");
  return id;
}

export async function readBoundedJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new SecretError("INVALID_REQUEST");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)) {
    throw new SecretError("PAYLOAD_TOO_LARGE");
  }
  if (!request.body) throw new SecretError("INVALID_REQUEST");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new SecretError("PAYLOAD_TOO_LARGE");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
  } catch (error) {
    if (error instanceof SecretError) throw error;
    throw new SecretError("INVALID_REQUEST");
  } finally {
    reader.releaseLock();
  }
}
