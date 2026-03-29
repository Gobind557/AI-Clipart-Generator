import { StatusBar } from "expo-status-bar";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { Image } from "expo-image";
import Slider from "@react-native-community/slider";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SkeletonTile } from "../../components/SkeletonTile";
import {
  createJob,
  getJobResults,
  getJobStatus,
  styles as clipStyles,
  type AppState,
  type ClipStyle,
  type StyleTile
} from "../../shared/api/jobsClient";
import {
  formatTileErrorMessage,
  getSharedFailureMessage,
  isFailedTile,
  isRenderableSuccess
} from "../../shared/api/tileResult";
import { readAsStringAsync, EncodingType } from "expo-file-system/legacy";
import { hasCachedResults, loadResultCache, saveResultCache } from "../../shared/cache/resultCache";
import { base64ToPngFileUri, savePngToGallery, sharePngFile } from "../../shared/media/exportImage";

const POLL_INTERVAL_MS = 1800;
const POLL_TIMEOUT_MS = 90000;
const MAX_IMAGE_EDGE = 512;

const emptyTilesForStyles = (styles: ClipStyle[]): StyleTile[] =>
  styles.map((style) => ({ style, status: "queued" as const }));

export default function GenerationScreen(): ReactElement {
  const [appState, setAppState] = useState<AppState>("idle");
  const [sourceUri, setSourceUri] = useState<string>("");
  const [sourceBase64, setSourceBase64] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [selectedStyles, setSelectedStyles] = useState<ClipStyle[]>([...clipStyles]);
  const [intensity, setIntensity] = useState(0.72);
  const [promptSuffix, setPromptSuffix] = useState("");
  const [tiles, setTiles] = useState<StyleTile[]>(emptyTilesForStyles(clipStyles));
  const [compareStyle, setCompareStyle] = useState<ClipStyle | null>(null);
  const [compareReveal, setCompareReveal] = useState(0.5);
  const [compareWidth, setCompareWidth] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [exportBusyKey, setExportBusyKey] = useState<string>("");
  const [savingAll, setSavingAll] = useState(false);
  const [restoreAvailable, setRestoreAvailable] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deviceIdRef = useRef(`device-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
  const lastCachedJobIdRef = useRef<string>("");

  const isBusy = appState === "uploading" || appState === "processing" || appState === "queued";
  const canGenerate = useMemo(
    () => !!sourceUri && !isBusy && selectedStyles.length > 0,
    [sourceUri, isBusy, selectedStyles.length]
  );
  const canRetry = useMemo(() => appState === "error" || appState === "partial", [appState]);

  const completedWithImage = useMemo(() => tiles.filter(isRenderableSuccess), [tiles]);

  const sharedFailureMessage = useMemo(() => getSharedFailureMessage(tiles), [tiles]);

  const clearPoll = (): void => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearPoll();
  }, []);

  useEffect(() => {
    void hasCachedResults().then(setRestoreAvailable);
  }, []);

  useEffect(() => {
    if (compareStyle !== null) return;
    const first = completedWithImage[0]?.style;
    if (first) setCompareStyle(first);
  }, [compareStyle, completedWithImage]);

  useEffect(() => {
    if (!jobId) return;
    if (appState !== "completed" && appState !== "partial") return;
    const allDone = tiles.every((t) => t.status === "completed" || t.status === "error");
    if (!allDone) return;
    if (lastCachedJobIdRef.current === jobId) return;
    if (!sourceUri) return;
    const hasSuccess = tiles.some(isRenderableSuccess);
    if (!hasSuccess) return;
    void saveResultCache({ sourceUri, tiles }).then((ok) => {
      if (ok) {
        lastCachedJobIdRef.current = jobId;
      }
      void hasCachedResults().then(setRestoreAvailable);
    });
  }, [jobId, appState, tiles, sourceUri]);

  const handleRestoreCache = async (): Promise<void> => {
    try {
      const loaded = await loadResultCache();
      if (!loaded) {
        setRestoreAvailable(false);
        Alert.alert("Nothing to restore", "No cached run found.");
        return;
      }
      clearPoll();
      setJobId("");
      lastCachedJobIdRef.current = "";
      setSourceUri(loaded.sourceUri);
      try {
        const b64 = await readAsStringAsync(loaded.sourceUri, { encoding: EncodingType.Base64 });
        setSourceBase64(b64);
      } catch {
        setSourceBase64("");
      }
      setCompareStyle(null);
      setCompareReveal(0.5);
      const stylesFromCache = loaded.tiles.map((t) => t.style);
      setSelectedStyles(
        [...stylesFromCache].sort((a, b) => clipStyles.indexOf(a) - clipStyles.indexOf(b))
      );
      setTiles(loaded.tiles);
      setAppState("completed");
      setErrorMessage("");
      Alert.alert("Restored", "Loaded your last successful run from this device.");
    } catch (_e) {
      Alert.alert("Restore failed", "Could not read cached files.");
    }
  };

  const prepareImageForUpload = async (
    uri: string,
    width?: number,
    height?: number
  ): Promise<{ uri: string; base64: string }> => {
    const sourceWidth = width ?? MAX_IMAGE_EDGE;
    const sourceHeight = height ?? MAX_IMAGE_EDGE;
    const scale = Math.min(MAX_IMAGE_EDGE / sourceWidth, MAX_IMAGE_EDGE / sourceHeight, 1);
    const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
    const outputHeight = Math.max(1, Math.round(sourceHeight * scale));

    const optimized = await manipulateAsync(uri, [{ resize: { width: outputWidth, height: outputHeight } }], {
      compress: 0.72,
      format: SaveFormat.JPEG,
      base64: true
    });

    if (!optimized.base64) {
      throw new Error("Unable to create optimized image payload.");
    }

    return { uri: optimized.uri, base64: optimized.base64 };
  };

  const ingestPickedAsset = async (uri: string, width?: number, height?: number): Promise<void> => {
    setAppState("uploading");
    const optimized = await prepareImageForUpload(uri, width, height);
    setSourceUri(optimized.uri);
    setSourceBase64(optimized.base64);
    setErrorMessage("");
    setJobId("");
    setCompareStyle(null);
    setTiles(emptyTilesForStyles(selectedStyles));
    setAppState("idle");
  };

  const pickFromLibrary = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Please allow access to your gallery.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
      base64: true
    });

    if (result.canceled) return;
    try {
      const asset = result.assets[0];
      await ingestPickedAsset(asset.uri, asset.width, asset.height);
    } catch (_error) {
      setAppState("error");
      setErrorMessage("Could not optimize the selected image.");
      Alert.alert("Upload failed", "Could not optimize the selected image.");
    }
  };

  const takePhoto = async (): Promise<void> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Please allow camera access.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
      base64: true
    });

    if (result.canceled) return;
    try {
      const asset = result.assets[0];
      await ingestPickedAsset(asset.uri, asset.width, asset.height);
    } catch (_error) {
      setAppState("error");
      setErrorMessage("Could not optimize the captured photo.");
      Alert.alert("Camera failed", "Could not optimize the captured photo.");
    }
  };

  const toggleStyle = (style: ClipStyle): void => {
    setSelectedStyles((prev) => {
      const has = prev.includes(style);
      if (has && prev.length === 1) {
        return prev;
      }
      if (has) {
        return prev.filter((s) => s !== style);
      }
      return [...prev, style].sort((a, b) => clipStyles.indexOf(a) - clipStyles.indexOf(b));
    });
  };

  const pollJob = (job: string, activeStyles: ClipStyle[]): void => {
    clearPoll();
    const startedAt = Date.now();

    pollRef.current = setInterval(async () => {
      try {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          clearPoll();
          setAppState("error");
          setErrorMessage("Generation timed out. Please retry.");
          return;
        }

        const statusResponse = await getJobStatus(job);
        const perStyle = statusResponse.perStyle ?? [];
        const merged = activeStyles.map((style) => {
          const found = perStyle.find((p) => p.style === style);
          return found ?? { style, status: "queued" as const };
        });

        setTiles(merged);
        setErrorMessage("");
        const hasAnyDone = merged.some((item) => item.status === "completed" || item.status === "error");
        setAppState(hasAnyDone && statusResponse.status !== "completed" ? "partial" : statusResponse.status);

        if (statusResponse.status === "completed" || statusResponse.status === "error") {
          clearPoll();
          const results = await getJobResults(job);
          const items = results.items ?? [];
          const mergedFinal = activeStyles.map((style) => {
            const found = items.find((p) => p.style === style);
            return found ?? { style, status: "error" as const, error: "Missing result" };
          });
          setTiles(mergedFinal);
          const hasAnyFailed = mergedFinal.some(isFailedTile);
          const hasAnySuccess = mergedFinal.some(isRenderableSuccess);
          if (hasAnyFailed && hasAnySuccess) {
            setAppState("partial");
          } else {
            setAppState(statusResponse.status);
          }
        }
      } catch (_error) {
        clearPoll();
        setAppState("error");
        setErrorMessage("Unable to fetch job status. Check connection and retry.");
      }
    }, POLL_INTERVAL_MS);
  };

  const generateAll = async (): Promise<void> => {
    if (!sourceUri || !sourceBase64 || selectedStyles.length === 0) return;

    try {
      clearPoll();
      setErrorMessage("");
      setAppState("uploading");
      setCompareReveal(0.5);
      setTiles(selectedStyles.map((style) => ({ style, status: "processing" })));

      lastCachedJobIdRef.current = "";
      const job = await createJob(sourceBase64, "image/jpeg", 512, 512, selectedStyles, {
        intensity,
        deviceId: deviceIdRef.current,
        promptSuffix: promptSuffix.trim() || undefined
      });

      setJobId(job.jobId);
      setAppState("processing");
      pollJob(job.jobId, selectedStyles);
    } catch (_error) {
      setAppState("error");
      setErrorMessage("Could not create generation job.");
      Alert.alert("Generation failed", "Please retry.");
    }
  };

  const retryGeneration = async (): Promise<void> => {
    await generateAll();
  };

  const exportPngForTile = async (tile: StyleTile): Promise<string> => {
    if (!tile.imageBase64) {
      throw new Error("No image data for this style.");
    }
    return base64ToPngFileUri(tile.imageBase64, tile.style);
  };

  const handleSaveTile = async (tile: StyleTile): Promise<void> => {
    const key = `save-${tile.style}`;
    try {
      setExportBusyKey(key);
      const uri = await exportPngForTile(tile);
      await savePngToGallery(uri);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save image.";
      Alert.alert("Save failed", message);
    } finally {
      setExportBusyKey("");
    }
  };

  const handleShareTile = async (tile: StyleTile): Promise<void> => {
    const key = `share-${tile.style}`;
    try {
      setExportBusyKey(key);
      const uri = await exportPngForTile(tile);
      await sharePngFile(uri, `Share ${tile.style} clipart`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not share image.";
      Alert.alert("Share failed", message);
    } finally {
      setExportBusyKey("");
    }
  };

  const handleSaveAll = async (): Promise<void> => {
    const done = tiles.filter(isRenderableSuccess);
    if (done.length === 0) {
      Alert.alert("Nothing to save", "Wait until at least one style finishes successfully.");
      return;
    }
    try {
      setSavingAll(true);
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow access to save clipart to your gallery.");
        return;
      }
      for (const tile of done) {
        const uri = await exportPngForTile(tile);
        await savePngToGallery(uri, { silent: true, skipPermissionCheck: true });
      }
      Alert.alert("Saved", `Saved ${done.length} image(s) to your gallery.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Batch save failed.";
      Alert.alert("Save failed", message);
    } finally {
      setSavingAll(false);
    }
  };

  const completedDataUri = (base64: string): string => `data:image/png;base64,${base64}`;

  const compareTile = tiles.find((t) => t.style === compareStyle && t.imageBase64);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>AI Clipart Generator</Text>
        <Text style={styles.subtitle}>Upload once, pick styles, generate in parallel.</Text>
        {restoreAvailable ? (
          <Pressable onPress={() => void handleRestoreCache()} style={styles.restoreLinkWrap} hitSlop={10}>
            <Text style={styles.restoreLink}>Open last saved results on this device</Text>
          </Pressable>
        ) : null}

        <View style={styles.row}>
          <Pressable style={[styles.primaryButton, styles.rowBtn]} onPress={pickFromLibrary}>
            <Text style={styles.primaryButtonText}>Gallery</Text>
          </Pressable>
          <Pressable style={[styles.outlineButton, styles.rowBtn]} onPress={takePhoto}>
            <Text style={styles.outlineButtonText}>Camera</Text>
          </Pressable>
        </View>

        {sourceUri ? <Image source={sourceUri} style={styles.preview} contentFit="cover" /> : null}

        <Text style={styles.sectionLabel}>Styles to generate</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {clipStyles.map((style) => {
            const on = selectedStyles.includes(style);
            return (
              <Pressable
                key={style}
                onPress={() => toggleStyle(style)}
                style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{style}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionLabel}>Style strength</Text>
        <View style={styles.sliderRow}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={intensity}
            onValueChange={setIntensity}
            minimumTrackTintColor="#8b5cf6"
            maximumTrackTintColor="#475569"
            thumbTintColor="#c4b5fd"
          />
          <Text style={styles.sliderValue}>{intensity.toFixed(2)}</Text>
        </View>

        <Text style={styles.sectionLabel}>Custom prompt (optional)</Text>
        <TextInput
          style={styles.promptInput}
          placeholder="e.g. round wire glasses, navy hoodie—small add-ons; keeps your face from the photo"
          placeholderTextColor="#64748b"
          multiline
          maxLength={400}
          value={promptSuffix}
          onChangeText={setPromptSuffix}
        />
        <Text style={styles.promptHint}>
          {promptSuffix.length}/400 · best for accessories/clothing; server stresses matching the photo’s person
        </Text>

        <Pressable style={[styles.secondaryButton, !canGenerate && styles.disabled]} onPress={generateAll} disabled={!canGenerate}>
          <Text style={styles.secondaryButtonText}>Generate selected styles</Text>
        </Pressable>

        {completedWithImage.length > 0 ? (
          <Pressable
            style={[styles.outlineButtonWide, (savingAll || !!exportBusyKey) && styles.disabled]}
            disabled={savingAll || !!exportBusyKey}
            onPress={() => void handleSaveAll()}
          >
            {savingAll ? (
              <ActivityIndicator color="#e2e8f0" />
            ) : (
              <Text style={styles.outlineButtonText}>Save all PNGs to gallery</Text>
            )}
          </Pressable>
        ) : null}

        {canRetry ? (
          <Pressable style={styles.retryButton} onPress={retryGeneration} disabled={isBusy}>
            <Text style={styles.retryButtonText}>Retry generation</Text>
          </Pressable>
        ) : null}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {sourceUri && completedWithImage.length > 0 ? (
          <View style={styles.compareSection}>
            <Text style={styles.sectionLabel}>Before / after</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {completedWithImage.map((t) => (
                <Pressable
                  key={t.style}
                  onPress={() => setCompareStyle(t.style)}
                  style={[styles.chip, compareStyle === t.style ? styles.chipOn : styles.chipOff]}
                >
                  <Text style={[styles.chipText, compareStyle === t.style && styles.chipTextOn]}>{t.style}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {compareTile?.imageBase64 ? (
              <View style={styles.compareSliderBlock}>
                <Text style={styles.compareHint}>Drag slider — left: original · right: {compareStyle}</Text>
                <View
                  style={styles.compareFrame}
                  onLayout={(e) => setCompareWidth(e.nativeEvent.layout.width)}
                >
                  {compareWidth > 0 ? (
                    <>
                      <Image
                        source={completedDataUri(compareTile.imageBase64)}
                        style={[styles.compareFullImage, { width: compareWidth }]}
                        contentFit="cover"
                      />
                      <View
                        style={[
                          styles.compareClip,
                          {
                            width: Math.max(0, 1 - compareReveal) * compareWidth
                          }
                        ]}
                      >
                        <Image source={sourceUri} style={{ width: compareWidth, height: 200 }} contentFit="cover" />
                      </View>
                      <View
                        pointerEvents="none"
                        style={[
                          styles.compareDivider,
                          {
                            left: Math.min(
                              compareWidth - 2,
                              Math.max(0, (1 - compareReveal) * compareWidth - 1)
                            )
                          }
                        ]}
                      />
                    </>
                  ) : null}
                </View>
                <Slider
                  style={styles.compareSlider}
                  minimumValue={0}
                  maximumValue={1}
                  step={0.01}
                  value={compareReveal}
                  onValueChange={setCompareReveal}
                  minimumTrackTintColor="#38bdf8"
                  maximumTrackTintColor="#8b5cf6"
                  thumbTintColor="#f8fafc"
                />
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Results</Text>
        {sharedFailureMessage ? (
          <View style={styles.resultsErrorBanner}>
            <Text style={styles.resultsErrorBannerTitle}>Generation didn’t finish</Text>
            <Text style={styles.resultsErrorBannerBody}>{sharedFailureMessage}</Text>
            <Text style={styles.resultsErrorBannerHint}>
              Styles below couldn’t be produced; fix the issue once, then retry.
            </Text>
          </View>
        ) : null}
        <View style={styles.grid}>
          {tiles.map((tile) => {
            const failed = isFailedTile(tile);
            const sameAsShared =
              !!sharedFailureMessage &&
              failed &&
              formatTileErrorMessage(tile.error) === sharedFailureMessage;
            return (
            <View key={tile.style} style={styles.tile}>
              <Text style={styles.tileTitle}>{tile.style}</Text>
              {tile.status === "processing" ? (
                <SkeletonTile height={120} />
              ) : isRenderableSuccess(tile) ? (
                <Image source={completedDataUri(tile.imageBase64!)} style={styles.result} contentFit="cover" />
              ) : failed && sameAsShared ? (
                <View style={styles.tileFailedCompact}>
                  <Text style={styles.tileFailedCompactMark}>×</Text>
                  <Text style={styles.tileFailedCompactLabel}>Not generated</Text>
                </View>
              ) : failed ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorBoxText}>{formatTileErrorMessage(tile.error)}</Text>
                </View>
              ) : (
                <View style={styles.pendingBox}>
                  <Text style={styles.pendingText}>Pending</Text>
                </View>
              )}
              <Text style={styles.tileStatus}>{failed ? "failed" : tile.status}</Text>
              {isRenderableSuccess(tile) ? (
                <View style={styles.tileActions}>
                  <Pressable
                    style={[styles.tileActionBtn, exportBusyKey === `save-${tile.style}` && styles.tileActionDisabled]}
                    disabled={!!exportBusyKey || savingAll}
                    onPress={() => void handleSaveTile(tile)}
                  >
                    <Text style={styles.tileActionText}>Save PNG</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.tileActionBtn, exportBusyKey === `share-${tile.style}` && styles.tileActionDisabled]}
                    disabled={!!exportBusyKey || savingAll}
                    onPress={() => void handleShareTile(tile)}
                  >
                    <Text style={styles.tileActionText}>Share</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1117"
  },
  content: {
    padding: 16,
    paddingBottom: 48
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700"
  },
  subtitle: {
    marginTop: 8,
    color: "#c0c7d1"
  },
  restoreLinkWrap: {
    alignSelf: "flex-start",
    marginTop: 6,
    marginBottom: 2,
    paddingVertical: 4
  },
  restoreLink: {
    color: "#60a5fa",
    fontSize: 13,
    textDecorationLine: "underline"
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18
  },
  rowBtn: {
    flex: 1,
    marginTop: 0
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "600"
  },
  outlineButton: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#64748b",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  outlineButtonText: {
    color: "#e2e8f0",
    fontWeight: "600"
  },
  outlineButtonWide: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#64748b",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  sectionLabel: {
    marginTop: 16,
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 10,
    paddingRight: 8
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1
  },
  chipOn: {
    backgroundColor: "#5b21b6",
    borderColor: "#a78bfa"
  },
  chipOff: {
    borderColor: "#475569",
    backgroundColor: "#1e293b"
  },
  chipText: {
    color: "#94a3b8",
    textTransform: "capitalize",
    fontWeight: "600",
    fontSize: 13
  },
  chipTextOn: {
    color: "#ffffff"
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4
  },
  slider: {
    flex: 1,
    height: 40
  },
  sliderValue: {
    color: "#e2e8f0",
    width: 44
  },
  promptInput: {
    marginTop: 8,
    minHeight: 72,
    maxHeight: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#475569",
    backgroundColor: "#1e293b",
    color: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    textAlignVertical: "top"
  },
  promptHint: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 11
  },
  secondaryButton: {
    marginTop: 14,
    backgroundColor: "#8b5cf6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontWeight: "600"
  },
  retryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  retryButtonText: {
    color: "#dbeafe",
    fontWeight: "600"
  },
  disabled: {
    opacity: 0.45
  },
  preview: {
    marginTop: 16,
    width: "100%",
    height: 220,
    borderRadius: 14
  },
  errorText: {
    marginTop: 6,
    color: "#fda4af",
    fontSize: 13
  },
  compareSection: {
    marginTop: 8
  },
  compareSliderBlock: {
    marginTop: 10
  },
  compareHint: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 8
  },
  compareFrame: {
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1f2430"
  },
  compareFullImage: {
    height: 200,
    position: "absolute",
    left: 0,
    top: 0
  },
  compareClip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden"
  },
  compareDivider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: "#f8fafc",
    opacity: 0.95
  },
  compareSlider: {
    width: "100%",
    height: 44,
    marginTop: 6
  },
  resultsErrorBanner: {
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#2a121c",
    borderWidth: 1,
    borderColor: "#7f1d1d"
  },
  resultsErrorBannerTitle: {
    color: "#fecdd3",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6
  },
  resultsErrorBannerBody: {
    color: "#fda4af",
    fontSize: 14,
    lineHeight: 20
  },
  resultsErrorBannerHint: {
    marginTop: 10,
    color: "#9ca3af",
    fontSize: 12,
    lineHeight: 17
  },
  grid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  tileFailedCompact: {
    height: 120,
    borderRadius: 8,
    backgroundColor: "#252a34",
    borderWidth: 1,
    borderColor: "#3f3f46",
    justifyContent: "center",
    alignItems: "center",
    gap: 4
  },
  tileFailedCompactMark: {
    color: "#f87171",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32
  },
  tileFailedCompactLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600"
  },
  tile: {
    width: "47%",
    backgroundColor: "#1f2430",
    borderRadius: 12,
    padding: 10
  },
  tileTitle: {
    color: "#ffffff",
    textTransform: "capitalize",
    fontWeight: "700",
    marginBottom: 8
  },
  pendingBox: {
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#475569",
    justifyContent: "center",
    alignItems: "center"
  },
  pendingText: {
    color: "#64748b",
    fontSize: 13
  },
  errorBox: {
    height: 120,
    borderRadius: 8,
    backgroundColor: "#3f1d25",
    padding: 8,
    justifyContent: "center"
  },
  errorBoxText: {
    color: "#fda4af",
    fontSize: 11
  },
  result: {
    height: 120,
    borderRadius: 8
  },
  tileStatus: {
    marginTop: 8,
    color: "#a5b4fc",
    fontSize: 12
  },
  tileActions: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8
  },
  tileActionBtn: {
    flex: 1,
    backgroundColor: "#334155",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center"
  },
  tileActionDisabled: {
    opacity: 0.5
  },
  tileActionText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "600"
  }
});
