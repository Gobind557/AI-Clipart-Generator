import type { ClipStyle } from "../../schemas/jobs";
import { generateWithOpenAI } from "../ai/openaiProvider";
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

    try {
      const outputBase64 = await generateWithOpenAI({
        style,
        input: {
          imageBase64: job.input.imageBase64,
          mimeType: job.input.mimeType,
          intensity: job.input.intensity
        }
      });

      updateStyleResult(jobId, style, {
        status: "completed",
        imageBase64: outputBase64
      });
    } catch (error) {
      // Fallback keeps demo flow usable without blocking submission progress.
      await sleep(500);
      updateStyleResult(jobId, style, {
        status: "completed",
        imageBase64: buildPlaceholder(style),
        error: error instanceof Error ? error.message : "Provider failed; fallback used."
      });
    }
  }
};
