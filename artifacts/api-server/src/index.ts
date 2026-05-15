/**
 * Server entry point.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.join(here, "..", ".env") });
config({ path: path.join(here, "..", "..", "..", ".env") });

const { getGeminiRuntimeConfig } = await import("./lib/gemini");
const geminiConfig = getGeminiRuntimeConfig();
if (geminiConfig.configured) {
  logger.info({ source: geminiConfig.source, model: geminiConfig.model }, "Gemini API key loaded");
} else {
  logger.warn("WARNING: No Gemini API key - AI questions/scoring will fall back to local defaults");
}

const { default: app } = await import("./app");

const workerModules = [
  { name: "transcription", load: () => import("./workers/transcription") },
  { name: "scoring", load: () => import("./workers/scoring") },
  { name: "face-processing", load: () => import("./workers/face-processing") },
];

for (const mod of workerModules) {
  try {
    await mod.load();
    logger.info(`Worker loaded: ${mod.name}`);
  } catch (err) {
    logger.warn({ err, mod: mod.name }, "Worker failed to load - skipping. Core interview flow unaffected.");
  }
}

const port = Number(process.env["PORT"] ?? "3000");
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${port}"`);

app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error starting server");
    process.exit(1);
  }
  logger.info(`AI SkillFit API listening on port ${port}`);
  logger.info(`Health: http://localhost:${port}/api/healthz`);
});
