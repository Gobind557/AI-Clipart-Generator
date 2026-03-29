import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { cacheDirectory, EncodingType, writeAsStringAsync } from "expo-file-system/legacy";
import { Alert } from "react-native";

const ensureCacheDir = (): string => {
  if (!cacheDirectory) {
    throw new Error("Cache directory is not available.");
  }
  return cacheDirectory;
};

/**
 * Writes base64 image bytes to a temp file and re-encodes to PNG (gallery / submission-friendly).
 */
export const base64ToPngFileUri = async (base64: string, basename: string): Promise<string> => {
  const dir = ensureCacheDir();
  const safeName = basename.replace(/[^a-z0-9_-]/gi, "_");
  const rawPath = `${dir}clip-${safeName}-${Date.now()}.bin`;
  await writeAsStringAsync(rawPath, base64, { encoding: EncodingType.Base64 });

  const png = await manipulateAsync(rawPath, [], {
    format: SaveFormat.PNG,
    compress: 1
  });

  return png.uri;
};

export const savePngToGallery = async (
  fileUri: string,
  options?: { silent?: boolean; skipPermissionCheck?: boolean }
): Promise<void> => {
  if (!options?.skipPermissionCheck) {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow access to save clipart to your gallery.");
      return;
    }
  }

  await MediaLibrary.saveToLibraryAsync(fileUri);
  if (!options?.silent) {
    Alert.alert("Saved", "PNG saved to your gallery.");
  }
};

export const sharePngFile = async (fileUri: string, dialogTitle: string): Promise<void> => {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert("Sharing unavailable", "Sharing is not available on this device.");
    return;
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: "image/png",
    dialogTitle,
    UTI: "public.png"
  });
};
