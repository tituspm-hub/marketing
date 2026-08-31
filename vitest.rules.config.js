import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/rules/**/*.test.js"],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
