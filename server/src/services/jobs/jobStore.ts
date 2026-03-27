import { randomUUID } from "node:crypto";
import type { ClipStyle, CreateJobInput } from "../../schemas/jobs";

type StyleStatus = "queued" | "processing" | "completed" | "error";
type JobStatus = "queued" | "processing" | "partial" | "completed" | "error";

type JobResult = {
  style: ClipStyle;
  status: StyleStatus;
  imageBase64?: string;
  error?: string;
};

type JobRecord = {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  input: CreateJobInput;
  results: JobResult[];
};

const jobStore = new Map<string, JobRecord>();

const buildPlaceholder = (style: ClipStyle): string => {
  // Placeholder for round-1 backend wiring before real provider integration.
  return Buffer.from(`mock-${style}-${Date.now()}`).toString("base64");
};

const recalculateStatus = (job: JobRecord): JobStatus => {
  const completed = job.results.filter((item) => item.status === "completed").length;
  const errored = job.results.filter((item) => item.status === "error").length;
  const total = job.results.length;

  if (completed === total) return "completed";
  if (errored === total) return "error";
  if (completed > 0 || errored > 0) return "partial";
  return "processing";
};

const processJob = (jobId: string): void => {
  const job = jobStore.get(jobId);
  if (!job) return;

  job.status = "processing";
  job.updatedAt = new Date().toISOString();

  job.results.forEach((result, index) => {
    const delay = 1500 + index * 1000;
    setTimeout(() => {
      const currentJob = jobStore.get(jobId);
      if (!currentJob) return;

      result.status = "processing";
      currentJob.updatedAt = new Date().toISOString();
      jobStore.set(jobId, currentJob);

      setTimeout(() => {
        const finalJob = jobStore.get(jobId);
        if (!finalJob) return;

        result.status = "completed";
        result.imageBase64 = buildPlaceholder(result.style);
        finalJob.status = recalculateStatus(finalJob);
        finalJob.updatedAt = new Date().toISOString();
        jobStore.set(jobId, finalJob);
      }, 1300);
    }, delay);
  });
};

export const createJob = (input: CreateJobInput): JobRecord => {
  const now = new Date().toISOString();
  const job: JobRecord = {
    id: randomUUID(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    input,
    results: input.styles.map((style) => ({ style, status: "queued" }))
  };

  jobStore.set(job.id, job);
  setTimeout(() => processJob(job.id), 100);
  return job;
};

export const getJob = (jobId: string): JobRecord | undefined => {
  return jobStore.get(jobId);
};

export const getJobResults = (jobId: string): JobResult[] | undefined => {
  const job = jobStore.get(jobId);
  return job?.results;
};
