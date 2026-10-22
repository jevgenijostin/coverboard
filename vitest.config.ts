import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/model.ts", "src/license.ts"],
      reporter: ["text"],
      thresholds: { statements: 95, branches: 85, functions: 95, lines: 95 },
    },
  },
});
