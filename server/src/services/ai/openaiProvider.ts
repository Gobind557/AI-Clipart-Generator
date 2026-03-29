import type { ClipStyle, CreateJobInput } from "../../schemas/jobs";
import { buildStylePrompt } from "./stylePrompts";

type GenerateParams = {
  style: ClipStyle;
  input: Pick<CreateJobInput, "imageBase64" | "mimeType" | "intensity" | "promptSuffix">;
};

export const generateWithOpenAI = async ({ style, input }: GenerateParams): Promise<string> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const imageBytes = Buffer.from(input.imageBase64, "base64");
  const formData = new FormData();
  formData.append("model", "gpt-image-1");
  formData.append("prompt", buildStylePrompt(style, input.intensity, input.promptSuffix));
  formData.append("size", "1024x1024");
  formData.append("response_format", "b64_json");
  formData.append("image", new Blob([imageBytes], { type: input.mimeType }), "source-image");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const failureBody = await response.text();
    throw new Error(`OpenAI image edit failed (${response.status}): ${failureBody}`);
  }

  const payload = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const output = payload.data?.[0]?.b64_json;

  if (!output) {
    throw new Error("OpenAI response missing image payload.");
  }

  return output;
};
