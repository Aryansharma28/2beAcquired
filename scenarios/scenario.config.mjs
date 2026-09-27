// Scenario defaults. The simulated buyer and the judge run on a cheap model through OpenRouter (the key poof already
// uses): a full run of the suite costs about 2 cents. The agent under test is the real one (n8n test webhook).
// SCENARIO_MODEL / JUDGE_MODEL override the models.
import { config } from "dotenv";
import { defineConfig } from "@langwatch/scenario";
import { createOpenAI } from "@ai-sdk/openai";

config({ path: new URL("../.env", import.meta.url), quiet: true });

export const SIM_MODEL = process.env.SCENARIO_MODEL || "openai/gpt-4.1-mini";
export const JUDGE_MODEL = process.env.JUDGE_MODEL || "openai/gpt-4.1-mini";

export const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY,
  // Rate limited: wait as long as asked (up to 2 min) instead of failing the scenario.
  fetch: async (url, init) => {
    for (let i = 0; ; i++) {
      const res = await fetch(url, init);
      const wait = Number(res.headers.get("retry-after")) || 5;
      if (res.status !== 429 || i >= 5 || wait > 120) return res;
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  },
});

export default defineConfig({
  defaultModel: { model: openrouter.chat(SIM_MODEL), temperature: 0.7, maxTokens: 400 },
});
