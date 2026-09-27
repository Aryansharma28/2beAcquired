import { defineConfig } from "vitest/config";
import { withScenario } from "@langwatch/scenario/integrations/vitest/config";

export default withScenario(defineConfig({
  test: { testTimeout: 600_000, maxConcurrency: 4, hookTimeout: 60_000 },
}));
