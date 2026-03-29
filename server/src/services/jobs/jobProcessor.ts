import { formatProviderError } from "../ai/formatProviderError";
import { generateWithImageProvider } from "../ai/imageProvider";
import { getJob, updateJobStatus, updateStyleResult } from "./jobStore";

/**
 * Runs OpenAI calls in parallel for each style, while serializing job store updates
 * so polling clients see tiles complete in any order without race conditions.
 */
export const processGenerationJob = async (jobId: string): Promise<void> => {
  const job = getJob(jobId);
  if (!job) return;

  updateJobStatus(jobId, "processing");

  const styles = job.input.styles;
  for (const style of styles) {
    updateStyleResult(jobId, style, { status: "processing", error: undefined });
  }

  let updateChain: Promise<void> = Promise.resolve();
  const enqueueUpdate = (fn: () => void): void => {
    updateChain = updateChain.then(() => {
      fn();
    });
  };

  await Promise.all(
    styles.map(async (style) => {
      try {
        const outputBase64 = await generateWithImageProvider({
          style,
          input: {
            imageBase64: job.input.imageBase64,
            mimeType: job.input.mimeType,
            intensity: job.input.intensity,
            promptSuffix: job.input.promptSuffix
          }
        });

        enqueueUpdate(() => {
          updateStyleResult(jobId, style, {
            status: "completed",
            imageBase64: outputBase64
          });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Provider failed.";
        enqueueUpdate(() => {
          updateStyleResult(jobId, style, {
            status: "error",
            error: formatProviderError(message),
            imageBase64: undefined
          });
        });
      }
    })
  );

  await updateChain;
};
