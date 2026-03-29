import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  EncodingType,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync
} from "expo-file-system/legacy";
import type { ClipStyle, StyleTile } from "../api/jobsClient";
import { isRenderableSuccess } from "../api/tileResult";

const META_KEY = "clipart_result_cache_v1";
const CACHE_SUBDIR = "clipart-cache/";

type CacheMeta = {
  version: 1;
  savedAt: number;
  sourceFile: string;
  entries: { style: ClipStyle; file: string }[];
};

const cacheRoot = (): string => {
  if (!documentDirectory) {
    throw new Error("documentDirectory unavailable");
  }
  return `${documentDirectory}${CACHE_SUBDIR}`;
};

const ensureDir = async (): Promise<void> => {
  const root = cacheRoot();
  const info = await getInfoAsync(root).catch(() => ({ exists: false }));
  if (!info.exists) {
    await makeDirectoryAsync(root, { intermediates: true });
  }
};

const wipeCacheFiles = async (): Promise<void> => {
  const root = cacheRoot();
  const info = await getInfoAsync(root).catch(() => ({ exists: false }));
  if (info.exists) {
    await deleteAsync(root, { idempotent: true });
  }
  await ensureDir();
};

export const hasCachedResults = async (): Promise<boolean> => {
  const raw = await AsyncStorage.getItem(META_KEY);
  return !!raw;
};

export const saveResultCache = async (params: {
  sourceUri: string;
  tiles: StyleTile[];
}): Promise<boolean> => {
  const done = params.tiles.filter(isRenderableSuccess);
  if (done.length === 0 || !params.sourceUri || !documentDirectory) return false;

  /**
   * After "Open last saved results", `sourceUri` points inside `clipart-cache/`.
   * `wipeCacheFiles()` deletes that folder first, so we must snapshot the source
   * outside the cache before wiping (staging file in document root).
   */
  const staging = `${documentDirectory}clipart-save-staging.jpg`;

  try {
    const srcInfo = await getInfoAsync(params.sourceUri).catch(() => ({ exists: false }));
    if (!srcInfo.exists) return false;

    await copyAsync({ from: params.sourceUri, to: staging });

    await wipeCacheFiles();
    const root = cacheRoot();
    const stamp = Date.now();
    const sourceDest = `${root}source-${stamp}.jpg`;
    await copyAsync({ from: staging, to: sourceDest });

    const entries: CacheMeta["entries"] = [];
    for (const tile of done) {
      if (!tile.imageBase64) continue;
      const file = `${root}${tile.style}-${stamp}.bin`;
      await writeAsStringAsync(file, tile.imageBase64, { encoding: EncodingType.Base64 });
      entries.push({ style: tile.style, file });
    }

    const meta: CacheMeta = {
      version: 1,
      savedAt: stamp,
      sourceFile: sourceDest,
      entries
    };
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
    return true;
  } catch {
    await AsyncStorage.removeItem(META_KEY).catch(() => {});
    return false;
  } finally {
    await deleteAsync(staging, { idempotent: true }).catch(() => {});
  }
};

export const loadResultCache = async (): Promise<{
  sourceUri: string;
  tiles: StyleTile[];
} | null> => {
  const raw = await AsyncStorage.getItem(META_KEY);
  if (!raw) return null;

  let meta: CacheMeta;
  try {
    meta = JSON.parse(raw) as CacheMeta;
  } catch {
    return null;
  }

  const srcInfo = await getInfoAsync(meta.sourceFile).catch(() => ({ exists: false }));
  if (!srcInfo.exists) {
    await AsyncStorage.removeItem(META_KEY);
    return null;
  }

  const tiles: StyleTile[] = [];
  for (const entry of meta.entries) {
    const fi = await getInfoAsync(entry.file).catch(() => ({ exists: false }));
    if (!fi.exists) continue;
    const b64 = await readAsStringAsync(entry.file, { encoding: EncodingType.Base64 });
    tiles.push({
      style: entry.style,
      status: "completed",
      imageBase64: b64
    });
  }

  if (tiles.length === 0) {
    await AsyncStorage.removeItem(META_KEY);
    return null;
  }

  return { sourceUri: meta.sourceFile, tiles };
};

export const clearResultCache = async (): Promise<void> => {
  await AsyncStorage.removeItem(META_KEY);
  await wipeCacheFiles().catch(() => {});
};
