import type { ClipStyle, CreateJobInput } from "../../schemas/jobs";
import { generateWithOpenAI } from "./openaiProvider";
import { generateWithStability } from "./stabilityProvider";

export type GenerateArgs = {
  style: ClipStyle;
  input: Pick<CreateJobInput, "imageBase64" | "mimeType" | "intensity" | "promptSuffix">;
};

export const generateWithImageProvider = async (args: GenerateArgs): Promise<string> => {
  const mode = (process.env.IMAGE_PROVIDER ?? "openai").toLowerCase();
  if (mode === "stability") {
    return generateWithStability(args);
  }
  return generateWithOpenAI(args);
};
