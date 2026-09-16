import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    "client-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
  } },
  test: { environment: "node", include: ["tests/unit/**/*.test.ts"], restoreMocks: true, unstubGlobals: true },
});

