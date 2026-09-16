import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 35_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3105",
    trace: "off",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "node tests/support/rpc-server.mjs",
      url: "http://127.0.0.1:54329/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3105",
      url: "http://127.0.0.1:3105",
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "ghostkey-e2e-publishable-key",
        SUPABASE_SERVICE_ROLE_KEY: "ghostkey-e2e-service-key",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
