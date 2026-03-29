import type { ClipStyle } from "../../schemas/jobs";

/**
 * Strong, style-specific directions so img2img does not collapse into a generic glossy “AI portrait”.
 */
const stylePromptMap: Record<ClipStyle, string> = {
  cartoon:
    "Redraw as a 2D cartoon character portrait: thick confident ink outlines, flat color fills, " +
    "simple shaped shadows (no soft airbrush), readable nose/mouth simplification like TV animation. " +
    "Looks hand-inked, not 3D.",
  flat:
    "Strict flat graphic illustration: solid color shapes only, zero gradients, zero ambient occlusion, " +
    "minimal or no soft shading—poster / app-illustration look with clean silhouette.",
  anime:
    "Cel-shaded 2D anime illustration look (TV-animation rendering): crisp line art, flat color regions, " +
    "hard-edged shadow shapes—apply this STYLE to the same person in the photo, not a stock anime archetype. " +
    "Do not change ethnicity or facial bone structure to match a genre default.",
  pixel:
    "Pixel-art portrait: visible square pixel grid, hard color steps, no smooth airbrush. " +
    "Keep the same face layout as the reference—eyes, nose, mouth, glasses position readable in chunky pixels; " +
    "high-contrast silhouette, avoid muddy noise or unrecognizable blobs.",
  sketch:
    "Graphite pencil sketch on paper: visible pencil grain and hatching, soft tonal build-up, " +
    "organic line weight—not clean vector ink comic, not digital painting smudge."
};

const antiSlop =
  "Avoid photorealistic plastic skin, beauty-filter smoothness, 3D CGI render look, oily highlights, " +
  "generic stock-illustration mush, text, logos, watermarks, frames, or busy background clutter.";

/** Stops custom text from becoming a full face/body redesign. */
const identityLock =
  "IDENTITY LOCK: Same person as the input photo—keep head shape, face width, ethnicity, skin tone, age, jaw, " +
  "eye spacing, nose and mouth. Only change surface style (lines, flat color, shading); do not swap in a new character.";

export const buildStylePrompt = (
  style: ClipStyle,
  intensity?: number,
  promptSuffix?: string
): string => {
  const trimmedSuffix = promptSuffix?.trim();
  const tone =
    typeof intensity === "number"
      ? `Style strength ${intensity.toFixed(2)}: make the chosen look clear while obeying the identity lock above.`
      : "";
  const userExtra = trimmedSuffix
    ? `ACCESSORIES / STYLING ONLY (do not redesign the face): ${trimmedSuffix}. ` +
      "Apply only what this asks (e.g. round glasses shape)—keep underlying facial structure and identity from the photo."
    : "";
  return [
    "Use the input image as the source portrait: match pose, framing, and who this is.",
    identityLock,
    "You may change line style, shading, and palette to fit the art style; do not copy photographic skin texture.",
    stylePromptMap[style],
    tone,
    userExtra,
    antiSlop,
    "Single centered bust portrait, clean simple backdrop, high clarity, no text."
  ]
    .filter(Boolean)
    .join(" ");
};

/** Stability SDXL: weighted negative prompt (text_prompts weight -1). */
export const buildStyleNegativePrompt = (style: ClipStyle): string => {
  const base =
    "photorealistic, hyperrealistic, dslr photo, skin pores, subsurface scattering, " +
    "plastic doll, wax figure, airbrushed, gaussian blur, depth of field, bokeh, " +
    "3d render, octane, unreal engine, lowres, jpeg artifacts, watermark, signature, text, logo, " +
    "deformed, extra fingers, duplicate face, different person, face replacement, race swap, wrong ethnicity";
  const byStyle: Record<ClipStyle, string> = {
    cartoon: ", oil painting, impasto, muddy colors, thin hairline outlines only",
    flat: ", gradient mesh, soft shading, volumetric light, painterly brush strokes",
    anime: ", western cartoon, claymation, chibi, hyperdetailed pores, film grain photo",
    pixel: ", vector smooth curves, anti-aliased gradient, painterly, watercolor, subsurface",
    sketch: ", bold flat comic inks only, cel shading, full color painting, neon glow"
  };
  return base + byStyle[style];
};
