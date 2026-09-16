import { REVEAL_HEADER } from "@/lib/secrets/constants";
import { SecretError } from "@/lib/secrets/errors";
import { assertSameOrigin, errorResponse, jsonResponse, PRIVATE_HEADERS, validateSecretId } from "@/lib/secrets/http";
import { consumeSecret, deleteSecret, peekSecret } from "@/lib/secrets/server";
import { deletionTokenSchema } from "@/lib/validation/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function HEAD(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertSameOrigin(request);
    const id = validateSecretId((await context.params).id);
    const secret = await peekSecret(id);
    return new Response(null, {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        "X-Secret-State": "AVAILABLE",
        "X-Secret-Expires-At": secret.expiresAt,
        "X-Secret-Max-Views": String(secret.maxViews),
        "X-Secret-View-Count": String(secret.viewCount),
        "X-Secret-Remaining-Views": secret.remainingViews === null ? "unlimited" : String(secret.remainingViews),
      },
    });
  } catch (error) {
    return errorResponse(error, true);
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertSameOrigin(request);
    const id = validateSecretId((await context.params).id);
    // A link preview, prefetch, or ordinary navigation cannot spend a view.
    if (request.headers.get(REVEAL_HEADER) !== "1") throw new SecretError("INVALID_REQUEST");
    return jsonResponse(await consumeSecret(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    assertSameOrigin(request);
    const id = validateSecretId((await context.params).id);
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!deletionTokenSchema.safeParse(token).success) throw new SecretError("FORBIDDEN");
    await deleteSecret(id, token);
    return new Response(null, { status: 204, headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
