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
    // Each test file gets its own forked worker (isolate stays on) and each
    // jsdom environment costs several seconds to build. On this 4-vCPU QA host
    // the default maxWorkers (availableParallelism - 1 = 3) plus concurrent
    // agent tooling leaves no core headroom: import-heavy tests then exceed the
    // unchanged 5000ms test timeout and fresh workers miss Vitest's 90s start
    // deadline ("Timeout waiting for worker to respond"). Capping concurrency
    // at 2 reduces self-contention only - no timeout, isolation, or assertion
    // is relaxed, and every test still runs.
    maxWorkers: 2,
  },
});
