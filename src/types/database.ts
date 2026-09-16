export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Only server-side RPCs are intentionally exposed by this client type.
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      create_secret: {
        Args: {
          p_secret_hash: string;
          p_deletion_token_hash: string;
          p_ciphertext: string;
          p_iv: string;
          p_expires_in: number;
          p_max_views: number;
          p_rate_limit_key: string;
        };
        Returns: Json;
      };
      peek_secret: { Args: { p_secret_hash: string }; Returns: Json };
      consume_secret: { Args: { p_secret_hash: string }; Returns: Json };
      delete_secret: { Args: { p_secret_hash: string; p_deletion_token_hash: string }; Returns: Json };
      cleanup_expired_secrets: { Args: Record<string, never>; Returns: number };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

