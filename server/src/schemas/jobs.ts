import { z } from "zod";

export const styleEnum = z.enum(["cartoon", "flat", "anime", "pixel", "sketch"]);

export const createJobSchema = z.object({
  imageBase64: z.string().min(100, "Image payload is too small."),
  mimeType: z.enum(["image/jpeg", "image/png"]),
  width: z.number().int().positive().max(512),
  height: z.number().int().positive().max(512),
  styles: z.array(styleEnum).min(1).max(5),
  intensity: z.number().min(0).max(1).optional(),
  promptSuffix: z
    .string()
    .max(400)
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    })
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type ClipStyle = z.infer<typeof styleEnum>;
