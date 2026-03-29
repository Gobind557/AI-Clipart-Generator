import type { ClipStyle, CreateJobInput } from "../../schemas/jobs";
import { generateWithOpenAI } from "./openaiProvider";

export type GenerateArgs = {
  style: ClipStyle;
  input: Pick<CreateJobInput, "imageBase64" | "mimeType" | "intensity" | "promptSuffix">;
};

export const generateWithImageProvider = async (args: GenerateArgs): Promise<string> => {
  const mode = (process.env.IMAGE_PROVIDER ?? "openai").toLowerCase();
  if (mode === "stability") {
    /** Avoid loading `sharp` at boot — native module can crash the whole process on some hosts before `listen()`. */
    const { generateWithStability } = await import("./stabilityProvider.js");
    return generateWithStability(args);
  }
  return generateWithOpenAI(args);
};
