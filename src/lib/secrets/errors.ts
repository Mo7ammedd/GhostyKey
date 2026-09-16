export const ERROR_DEFINITIONS = {
  SECRET_NOT_FOUND: { status: 404, message: "This secret could not be found." },
  SECRET_EXPIRED: { status: 410, message: "This secret has expired and its encrypted contents have been deleted." },
  SECRET_CONSUMED: { status: 410, message: "This secret has already been consumed or deleted." },
  INVALID_SECRET_ID: { status: 400, message: "This secret link is not valid." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "Secrets must be no larger than 1 MB." },
  INVALID_REQUEST: { status: 400, message: "The request is not valid. Check your settings and try again." },
  FORBIDDEN: { status: 403, message: "This action is not authorized." },
  RATE_LIMITED: { status: 429, message: "Too many requests. Please wait before creating another secret." },
  SERVICE_UNAVAILABLE: { status: 503, message: "Secret storage is temporarily unavailable. Please try again later." },
  INTERNAL_ERROR: { status: 500, message: "Something went wrong. Please try again." },
} as const;

export type SecretErrorCode = keyof typeof ERROR_DEFINITIONS;

export class SecretError extends Error {
  constructor(public readonly code: SecretErrorCode, public readonly retryAfter?: number) {
    super(ERROR_DEFINITIONS[code].message);
    this.name = "SecretError";
  }
}

export function isSecretErrorCode(value: unknown): value is SecretErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_DEFINITIONS, value);
}

