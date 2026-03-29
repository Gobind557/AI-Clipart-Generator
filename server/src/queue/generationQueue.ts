import { Queue, Worker } from "bullmq";
import IORedis, { type RedisOptions } from "ioredis";
import { processGenerationJob } from "../services/jobs/jobProcessor";

type QueueMode = "memory" | "bullmq";

const queueName = "generation";
let mode: QueueMode = "memory";

let memoryChain: Promise<void> = Promise.resolve();
let queue: Queue | undefined;
let worker: Worker | undefined;

const getRedisUrl = (): string | undefined => {
  const url = process.env.REDIS_URL?.trim();
  return url && url.length > 0 ? url : undefined;
};

/** Safe log line (hostname only, no password). */
const redisHostHint = (redisUrl: string): string => {
  try {
    const normalized = redisUrl.replace(/^rediss:/i, "https:").replace(/^redis:/i, "http:");
    return new URL(normalized).hostname;
  } catch {
    return "(invalid REDIS_URL)";
  }
};

/**
 * BullMQ + managed Redis (Upstash, etc.): TLS URLs need `enableReadyCheck: false`
 * or connections hang / never reach the server.
 */
const redisOptions = (redisUrl: string): RedisOptions => {
  const tls = redisUrl.startsWith("rediss://") ? {} : undefined;
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(tls ? { tls } : {})
  };
};

export const initGenerationQueue = async (): Promise<void> => {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    mode = "memory";
    console.log("[queue] mode=memory (REDIS_URL not set)");
    return;
  }

  const opts = redisOptions(redisUrl);
  const probe = new IORedis(redisUrl, opts);
  probe.on("error", (err) => {
    console.error("[queue] redis (probe):", err.message);
  });

  try {
    const pong = await probe.ping();
    console.log(`[queue] redis ping ${pong} host=${redisHostHint(redisUrl)}`);
  } catch (err) {
    probe.disconnect();
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[queue] redis unreachable:", msg);
    throw new Error(
      `Redis connection failed (${msg}). Use Upstash "Redis" TLS URL (rediss://…), copy full URL into REDIS_URL.`
    );
  }
  probe.disconnect();

  mode = "bullmq";
  const connection = new IORedis(redisUrl, opts);
  connection.on("error", (err) => {
    console.error("[queue] redis (queue):", err.message);
  });

  queue = new Queue(queueName, { connection });
  console.log("[queue] mode=bullmq — enqueue uses Redis; set START_WORKER=true to run jobs on this service.");
};

export const enqueueGeneration = async (jobId: string): Promise<void> => {
  if (mode === "bullmq") {
    if (!queue) throw new Error("Queue not initialized.");
    try {
      await queue.add("generate", { jobId }, { removeOnComplete: true, removeOnFail: 100 });
    } catch (err) {
      console.error("[queue] add failed:", err instanceof Error ? err.message : err);
      throw err;
    }
    return;
  }

  memoryChain = memoryChain.then(async () => {
    await processGenerationJob(jobId);
  });
};

export const startGenerationWorker = (): void => {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    return;
  }

  const opts = redisOptions(redisUrl);
  const connection = new IORedis(redisUrl, opts);
  connection.on("error", (err) => {
    console.error("[queue] redis (worker):", err.message);
  });

  worker = new Worker(
    queueName,
    async (job) => {
      const id = (job.data as { jobId?: string }).jobId;
      if (!id) return;
      await processGenerationJob(id);
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    console.error("[queue] worker job failed", job?.id, err);
  });

  console.log("[queue] worker started (BullMQ consumer)");
};
