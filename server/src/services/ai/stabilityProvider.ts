import type { ClipStyle, CreateJobInput } from "../../schemas/jobs";
import { buildStyleNegativePrompt, buildStylePrompt } from "./stylePrompts";

/** SDXL 1024 engines reject non-whitelisted dimensions (e.g. client 512×512). */
const SDXL_INIT_SIZE = 1024;

type GenerateParams = {
  style: ClipStyle;
  input: Pick<CreateJobInput, "imageBase64" | "mimeType" | "intensity" | "promptSuffix">;
};

/** Slightly higher CFG helps pixel / flat styles stick to the prompt instead of drifting “pretty portrait”. */
const cfgScaleByStyle: Record<ClipStyle, number> = {
  cartoon: 7.5,
  flat: 8,
  anime: 7.5,
  /** Slightly below max: very high CFG + text can invent a new face instead of stylizing the reference. */
  pixel: 8.25,
  sketch: 7
};

/**
 * Stability image-to-image (SDXL engine on v1 REST API).
 * Set STABILITY_ENGINE_ID to an engine your API key can access (see Stability dashboard).
 * @see https://platform.stability.ai/docs/api-reference#tag/SDXL-and-SD1.6
 */
export const generateWithStability = async ({ style, input }: GenerateParams): Promise<string> => {
  const sharp = (await import("sharp")).default;

  const apiKey = process.env.STABILITY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("STABILITY_API_KEY is not configured.");
  }

  const engine =
    process.env.STABILITY_ENGINE_ID?.trim() || "stable-diffusion-xl-1024-v1-0";
  const url = `https://api.stability.ai/v1/generation/${engine}/image-to-image`;

  const imageBytes = Buffer.from(input.imageBase64, "base64");
  /** Contain + pad avoids cropping faces when upscaling square thumbs to SDXL 1024². */
  const initPng = await sharp(imageBytes)
    .resize(SDXL_INIT_SIZE, SDXL_INIT_SIZE, {
      fit: "contain",
      background: { r: 248, g: 250, b: 252, alpha: 1 }
    })
    .png()
    .toBuffer();

  /** Higher API image_strength = closer to init; user “style strength” up ⇒ lower strength = bolder restyle. */
  let imageStrength =
    typeof input.intensity === "number"
      ? Math.max(0.12, Math.min(0.92, 0.92 - input.intensity * 0.58))
      : 0.5;
  /** Custom prompts (e.g. “round glasses”) need extra adherence to the photo or the model redraws the whole face. */
  if (input.promptSuffix?.trim()) {
    imageStrength = Math.min(0.94, imageStrength + 0.12);
    imageStrength = Math.max(imageStrength, 0.24);
  }

  const formData = new FormData();
  formData.append(
    "init_image",
    new Blob([new Uint8Array(initPng)], { type: "image/png" }),
    "input.png"
  );
  formData.append("init_image_mode", "IMAGE_STRENGTH");
  formData.append("image_strength", String(imageStrength));
  formData.append("text_prompts[0][text]", buildStylePrompt(style, input.intensity, input.promptSuffix));
  formData.append("text_prompts[0][weight]", "1");
  formData.append("text_prompts[1][text]", buildStyleNegativePrompt(style));
  formData.append("text_prompts[1][weight]", "-1");
  formData.append("cfg_scale", String(cfgScaleByStyle[style]));
  formData.append("samples", "1");
  formData.append("steps", "45");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    },
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Stability API failed (${response.status}): ${errText.slice(0, 500)}`);
  }

  const payload = (await response.json()) as { artifacts?: Array<{ base64?: string }> };
  const output = payload.artifacts?.[0]?.base64;
  if (!output) {
    throw new Error("Stability response missing image artifact.");
  }

  return output;
};
