export type SecretMetadata = {
  expiresAt: string;
  maxViews: number;
  viewCount: number;
  remainingViews: number | null;
};

export type SecretResult = {
  id: string;
  url: string;
  deletionToken: string;
  expiresAt: string;
  maxViews: number;
};

