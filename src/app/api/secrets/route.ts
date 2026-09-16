import { assertSameOrigin, errorResponse, jsonResponse, readBoundedJson } from "@/lib/secrets/http";
import { SecretError } from "@/lib/secrets/errors";
import { createSecret } from "@/lib/secrets/server";
import { createSecretSchema } from "@/lib/validation/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const parsed = createSecretSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      const oversized = parsed.error.issues.some((issue) => issue.code === "too_big" && issue.path[0] === "ciphertext");
      throw new SecretError(oversized ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST");
    }
    return jsonResponse(await createSecret(parsed.data, request), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
