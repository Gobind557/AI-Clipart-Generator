import type { StyleTile } from "./jobsClient";

/** Real image ready to show, save, or share. */
export const isRenderableSuccess = (t: StyleTile): boolean =>
  t.status === "completed" && !!t.imageBase64 && !t.error;

/** Provider or server failure (includes legacy tiles marked completed+error). */
export const isFailedTile = (t: StyleTile): boolean =>
  t.status === "error" || (!!t.error && t.status === "completed");

/** User-facing copy if a raw technical string still reaches the client (cache / old servers). */
export const formatTileErrorMessage = (raw: string | undefined): string => {
  if (!raw?.trim()) return "Generation failed for this style.";
  const s = raw.trim();
  if (/insufficient_balance|not have enough balance|out of credits/i.test(s)) {
    return "Your image provider account is out of credits. Add billing or check the API key on the server.";
  }
  if (s.length > 300) {
    return `${s.slice(0, 240)}…`;
  }
  return s;
};

/**
 * When every failed tile failed for the same reason, show the message once in a banner
 * instead of repeating it in each card.
 */
export const getSharedFailureMessage = (tiles: StyleTile[]): string | null => {
  const failed = tiles.filter(isFailedTile);
  if (failed.length === 0) return null;
  const msgs = failed.map((t) => formatTileErrorMessage(t.error));
  const first = msgs[0];
  if (!first || !msgs.every((m) => m === first)) return null;
  return first;
};
