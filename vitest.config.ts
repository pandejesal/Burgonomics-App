import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: [
      "tests/**/*.test.ts",
      "src/core/**/*.test.ts",
      "src/features/**/*.test.tsx",
      "src/features/**/*.test.ts",
      "src/routes/**/*.test.tsx",
      "src/routes/**/*.test.ts",
    ],
    environment: "node",
  },
});
