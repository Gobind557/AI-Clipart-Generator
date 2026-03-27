import type { ClipStyle } from "../../schemas/jobs";
import { getJob, updateJobStatus, updateStyleResult } from "./jobStore";

const buildPlaceholder = (style: ClipStyle): string => {
  // Placeholder until we plug in real AI provider calls.
  return Buffer.from(`mock-${style}-${Date.now()}`).toString("base64");
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const processGenerationJob = async (jobId: string): Promise<void> => {
  const job = getJob(jobId);
  if (!job) return;

  updateJobStatus(jobId, "processing");

  for (const style of job.input.styles) {
    updateStyleResult(jobId, style, { status: "processing", error: undefined });
    await sleep(800);

    // Round-1: return mocked output; next milestone swaps this with real AI provider.
    updateStyleResult(jobId, style, {
      status: "completed",
      imageBase64: buildPlaceholder(style)
    });
  }
};
