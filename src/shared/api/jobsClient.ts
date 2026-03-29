export type ClipStyle = "cartoon" | "flat" | "anime" | "pixel" | "sketch";
export type StyleStatus = "queued" | "processing" | "completed" | "error";
export type AppState =
  | "idle"
  | "uploading"
  | "queued"
  | "processing"
  | "partial"
  | "completed"
  | "error";

export type StyleTile = {
  style: ClipStyle;
  status: StyleStatus;
  imageBase64?: string;
  error?: string;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8787/v1";

export const styles: ClipStyle[] = ["cartoon", "flat", "anime", "pixel", "sketch"];

export type CreateJobOptions = {
  intensity?: number;
  deviceId?: string;
  promptSuffix?: string;
};

export const createJob = async (
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png",
  width: number,
  height: number,
  selectedStyles: ClipStyle[],
  options?: CreateJobOptions
): Promise<{ jobId: string }> => {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (options?.deviceId) {
    headers["x-device-id"] = options.deviceId;
  }

  const response = await fetch(`${API_URL}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      imageBase64,
      mimeType,
      width,
      height,
      styles: selectedStyles,
      ...(typeof options?.intensity === "number" ? { intensity: options.intensity } : {}),
      ...(options?.promptSuffix && options.promptSuffix.trim().length > 0
        ? { promptSuffix: options.promptSuffix.trim().slice(0, 400) }
        : {})
    })
  });

  if (!response.ok) {
    throw new Error("Failed to create generation job.");
  }

  return response.json();
};

export const getJobStatus = async (jobId: string): Promise<{ status: AppState; perStyle: StyleTile[] }> => {
  const response = await fetch(`${API_URL}/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch job status.");
  }
  return response.json();
};

export const getJobResults = async (jobId: string): Promise<{ items: StyleTile[] }> => {
  const response = await fetch(`${API_URL}/jobs/${jobId}/results`);
  if (!response.ok) {
    throw new Error("Failed to fetch job results.");
  }
  return response.json();
};
