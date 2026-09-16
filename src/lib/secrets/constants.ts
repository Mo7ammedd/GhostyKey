export const MAX_SECRET_BYTES = 1_048_576;
export const GCM_TAG_BYTES = 16;
export const MAX_CIPHERTEXT_BYTES = MAX_SECRET_BYTES + GCM_TAG_BYTES;
export const MAX_CIPHERTEXT_LENGTH = Math.ceil((MAX_CIPHERTEXT_BYTES * 4) / 3);
export const MAX_REQUEST_BYTES = MAX_CIPHERTEXT_LENGTH + 1_024;
export const MIN_EXPIRATION_SECONDS = 60;
export const MAX_EXPIRATION_SECONDS = 30 * 24 * 60 * 60;
export const DEFAULT_EXPIRATION_SECONDS = 24 * 60 * 60;
export const DEFAULT_MAX_VIEWS = 1;
export const REVEAL_HEADER = "X-GhostKey-Reveal";

export const EXPIRATION_OPTIONS = [
  { value: "300", label: "5 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "24 hours" },
  { value: "604800", label: "7 days" },
  { value: "custom", label: "Custom duration" },
] as const;

export const VIEW_OPTIONS = [
  { value: 1, label: "One view" },
  { value: 5, label: "5 views" },
  { value: 10, label: "10 views" },
  { value: 0, label: "Unlimited views" },
] as const;

