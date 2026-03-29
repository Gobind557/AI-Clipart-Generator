import Constants from "expo-constants";

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

const resolveApiBase = (): string => {
  const extra = Constants.expoConfig?.extra?.apiUrl;
  const fromExtra = typeof extra === "string" ? extra.trim() : "";
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim() ?? "";
  const raw = fromExtra || fromEnv || "http://10.0.2.2:8787/v1";
  return raw.replace(/\/+$/, "");
};

const API_URL = resolveApiBase();

const readJobIdFromCreatePayload = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  for (const key of ["jobId", "id", "job_id"] as const) {
    const v = o[key];
    if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) return v;
  }
  return null;
};

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

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Create job: bad JSON (${response.status}).`);
  }

  if (!response.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `HTTP ${response.status}`;
    throw new Error(`Failed to create job: ${msg}`);
  }

  const jobId = readJobIdFromCreatePayload(data);
  if (!jobId) {
    throw new Error("Create job: response missing a UUID job id (expected jobId or id).");
  }
  return { jobId };
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
