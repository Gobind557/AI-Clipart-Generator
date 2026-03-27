import { randomUUID } from "node:crypto";
import type { ClipStyle, CreateJobInput } from "../../schemas/jobs";

export type StyleStatus = "queued" | "processing" | "completed" | "error";
export type JobStatus = "queued" | "processing" | "partial" | "completed" | "error";

export type JobResult = {
  style: ClipStyle;
  status: StyleStatus;
  imageBase64?: string;
  error?: string;
};

export type JobRecord = {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  input: CreateJobInput;
  results: JobResult[];
};

const jobStore = new Map<string, JobRecord>();

const recalculateStatus = (job: JobRecord): JobStatus => {
  const completed = job.results.filter((item) => item.status === "completed").length;
  const errored = job.results.filter((item) => item.status === "error").length;
  const total = job.results.length;

  if (completed === total) return "completed";
  if (errored === total) return "error";
  if (completed > 0 || errored > 0) return "partial";
  return "processing";
};

export const createJobRecord = (input: CreateJobInput): JobRecord => {
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
  return job;
};

export const getJob = (jobId: string): JobRecord | undefined => {
  return jobStore.get(jobId);
};

export const getJobResults = (jobId: string): JobResult[] | undefined => {
  const job = jobStore.get(jobId);
  return job?.results;
};

export const updateJobStatus = (jobId: string, status: JobStatus): void => {
  const job = jobStore.get(jobId);
  if (!job) return;
  job.status = status;
  job.updatedAt = new Date().toISOString();
  jobStore.set(jobId, job);
};

export const updateStyleResult = (
  jobId: string,
  style: ClipStyle,
  patch: Partial<JobResult>
): void => {
  const job = jobStore.get(jobId);
  if (!job) return;

  const result = job.results.find((item) => item.style === style);
  if (!result) return;

  Object.assign(result, patch);
  job.status = recalculateStatus(job);
  job.updatedAt = new Date().toISOString();
  jobStore.set(jobId, job);
};
