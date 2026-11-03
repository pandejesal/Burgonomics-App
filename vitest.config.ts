import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "src/core/**/*.test.ts",
      "src/core/**/*.test.tsx",
      "src/shared/**/*.test.ts",
      "src/shared/**/*.test.tsx",
      "src/lib/**/*.test.ts",
      "src/lib/**/*.test.tsx",
      "src/features/**/*.test.tsx",
      "src/features/**/*.test.ts",
      "src/routes/**/*.test.tsx",
      "src/routes/**/*.test.ts",
      // Shared UI primitives were previously untested by discovery: a component
      // test placed beside src/components/** was silently never collected.
      "src/components/**/*.test.tsx",
      "src/components/**/*.test.ts",
    ],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
