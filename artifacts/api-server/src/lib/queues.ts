/**
 * queues.ts — graceful Redis fallback
 * FIX: Server no longer crashes when Redis is unavailable.
 * Falls back to inline in-memory processing.
 */
import { logger } from "./logger";

type JobHandler = (job: { data: unknown }) => Promise<unknown>;

class NoOpQueue {
  private name: string;
  private handler: JobHandler | null = null;
  constructor(name: string) { this.name = name; }
  process(handler: JobHandler) { this.handler = handler; }
  async add(data: unknown): Promise<void> {
    if (!this.handler) return;
    try { await this.handler({ data }); }
    catch (err) { logger.warn({ err, queue: this.name }, "Inline queue job failed"); }
  }
  on(_event: string, _cb: (...args: unknown[]) => void) { return this; }
  async close() {}
}

let transcriptionQueue: NoOpQueue;
let scoringQueue: NoOpQueue;
let faceProcessingQueue: NoOpQueue;

async function createQueues() {
  try {
    const Queue = (await import("bull")).default;
    const redisConfig = {
      host: process.env["REDIS_HOST"] ?? "localhost",
      port: parseInt(process.env["REDIS_PORT"] ?? "6379", 10),
      ...(process.env["REDIS_PASSWORD"] ? { password: process.env["REDIS_PASSWORD"] } : {}),
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    };
    const tq = new Queue("transcription", { redis: redisConfig });
    const sq = new Queue("scoring", { redis: redisConfig });
    const fq = new Queue("face-processing", { redis: redisConfig });

    await Promise.race([
      (tq as any).client.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Redis timeout")), 3000)),
    ]);

    logger.info("Redis connected — using Bull queues");
    tq.on("failed", (job, err) => logger.error({ jobId: job.id, err }, "Transcription failed"));
    sq.on("failed", (job, err) => logger.error({ jobId: job.id, err }, "Scoring failed"));
    fq.on("failed", (job, err) => logger.error({ jobId: job.id, err }, "Face processing failed"));

    return {
      transcriptionQueue: tq as unknown as NoOpQueue,
      scoringQueue: sq as unknown as NoOpQueue,
      faceProcessingQueue: fq as unknown as NoOpQueue,
    };
  } catch (err) {
    logger.warn({ err }, "Redis unavailable — using in-memory queues (fine for demo)");
    return {
      transcriptionQueue: new NoOpQueue("transcription"),
      scoringQueue: new NoOpQueue("scoring"),
      faceProcessingQueue: new NoOpQueue("face-processing"),
    };
  }
}

const queues = await createQueues();
transcriptionQueue = queues.transcriptionQueue;
scoringQueue = queues.scoringQueue;
faceProcessingQueue = queues.faceProcessingQueue;

export { transcriptionQueue, scoringQueue, faceProcessingQueue };

process.on("SIGTERM", async () => {
  await Promise.all([transcriptionQueue.close(), scoringQueue.close(), faceProcessingQueue.close()]);
  process.exit(0);
});
process.on("SIGINT", async () => {
  await Promise.all([transcriptionQueue.close(), scoringQueue.close(), faceProcessingQueue.close()]);
  process.exit(0);
});
