import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SecretError } from "@/lib/secrets/errors";
import type { Database } from "@/types/database";

const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().refine((url) => {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
}).refine((environment) => Boolean(environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || environment.NEXT_PUBLIC_SUPABASE_ANON_KEY));

export function getServerEnvironment() {
  // Reflect prevents Next.js from baking public-prefixed values into this server
  // module. This also keeps a single build usable across deployment environments.
  const read = (name: string): unknown => Reflect.get(process.env, name);
  const result = environmentSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: read("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: read("NEXT_PUBLIC_SUPABASE_ANON_KEY") || undefined,
    SUPABASE_SERVICE_ROLE_KEY: read("SUPABASE_SERVICE_ROLE_KEY"),
  });
  if (!result.success) throw new SecretError("SERVICE_UNAVAILABLE");
  return result.data;
}

let client: SupabaseClient<Database> | undefined;

export function getSupabaseServerClient(): SupabaseClient<Database> {
  if (!client) {
    const environment = getServerEnvironment();
    client = createClient<Database>(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
      db: { retry: false },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }
  return client;
}
