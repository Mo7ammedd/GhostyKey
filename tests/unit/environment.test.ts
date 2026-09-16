import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getServerEnvironment } from "@/lib/supabase/server";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic-project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("server environment", () => {
  it("accepts a Supabase publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_synthetic_test_key");
    expect(getServerEnvironment().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_synthetic_test_key");
  });

  it("also accepts the legacy anon variable", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
    expect(getServerEnvironment().NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("synthetic-anon-key");
  });

  it("never substitutes a public key for missing server credentials", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_synthetic_test_key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => getServerEnvironment()).toThrow("Secret storage is temporarily unavailable.");
  });
});
