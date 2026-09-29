import { defineConfig } from "vitest/config";

// Unit and component tests: `npm test`. The browser tests for the whole stack
// live in ../e2e.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
