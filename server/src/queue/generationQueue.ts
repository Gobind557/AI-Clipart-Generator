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

/** Managed Redis (Upstash TLS) + BullMQ: `enableReadyCheck: false` avoids stuck handshakes. */
const redisOptions = (redisUrl: string): RedisOptions => {
  const tls = redisUrl.startsWith("rediss://") ? {} : undefined;
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(tls ? { tls } : {})
  };
};

export const initGenerationQueue = (): void => {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    mode = "memory";
    return;
  }

  mode = "bullmq";
  const connection = new IORedis(redisUrl, redisOptions(redisUrl));
  queue = new Queue(queueName, { connection });
};

export const enqueueGeneration = async (jobId: string): Promise<void> => {
  if (mode === "bullmq") {
    if (!queue) initGenerationQueue();
    if (!queue) throw new Error("Queue not initialized.");
    await queue.add("generate", { jobId }, { removeOnComplete: true, removeOnFail: 100 });
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

  const connection = new IORedis(redisUrl, redisOptions(redisUrl));

  worker = new Worker(
    queueName,
    async (job) => {
      const jid = (job.data as { jobId?: string }).jobId;
      if (!jid) return;
      await processGenerationJob(jid);
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    console.error("worker failed", job?.id, err);
  });
};
