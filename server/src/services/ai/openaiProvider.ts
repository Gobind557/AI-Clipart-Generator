import type { ClipStyle, CreateJobInput } from "../../schemas/jobs";

type GenerateParams = {
  style: ClipStyle;
  input: Pick<CreateJobInput, "imageBase64" | "mimeType" | "intensity">;
};

const stylePromptMap: Record<ClipStyle, string> = {
  cartoon: "Create a clean cartoon portrait with bold lines and playful color blocks.",
  flat: "Create a flat illustration portrait with geometric shapes and minimal shading.",
  anime: "Create an anime-style portrait with expressive eyes, clean cel-shading, and vibrant tones.",
  pixel: "Create a pixel-art portrait with retro 16-bit style and clear pixel clusters.",
  sketch: "Create a pencil sketch outline portrait with monochrome line-work and subtle shading."
};

const buildPrompt = (style: ClipStyle, intensity?: number): string => {
  const tone = typeof intensity === "number" ? `Style intensity: ${intensity.toFixed(2)}.` : "";
  return [
    "Transform the provided input image of a person into a stylized clipart version.",
    "Preserve facial identity, pose framing, and recognizable features.",
    stylePromptMap[style],
    tone,
    "High quality, no text, no watermark, centered portrait."
  ]
    .filter(Boolean)
    .join(" ");
};

export const generateWithOpenAI = async ({ style, input }: GenerateParams): Promise<string> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const imageBytes = Buffer.from(input.imageBase64, "base64");
  const formData = new FormData();
  formData.append("model", "gpt-image-1");
  formData.append("prompt", buildPrompt(style, input.intensity));
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
