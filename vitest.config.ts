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
    ],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
