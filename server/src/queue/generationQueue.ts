import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
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

export const initGenerationQueue = (): void => {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    mode = "memory";
    return;
  }

  mode = "bullmq";
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null
  });

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
  await memoryChain;
};

export const startGenerationWorker = (): void => {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    // Memory mode processes on enqueue; no separate worker needed.
    return;
  }

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null
  });

  worker = new Worker(
    queueName,
    async (job) => {
      const jobId = (job.data as { jobId?: string }).jobId;
      if (!jobId) return;
      await processGenerationJob(jobId);
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    console.error("worker failed", job?.id, err);
  });
};

