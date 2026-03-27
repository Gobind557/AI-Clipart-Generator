import { StatusBar } from "expo-status-bar";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  createJob,
  getJobResults,
  getJobStatus,
  styles as clipStyles,
  type AppState,
  type StyleTile
} from "./src/shared/api/jobsClient";

const POLL_INTERVAL_MS = 1800;
const MAX_IMAGE_EDGE = 512;

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [sourceUri, setSourceUri] = useState<string>("");
  const [sourceBase64, setSourceBase64] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [tiles, setTiles] = useState<StyleTile[]>(clipStyles.map((style) => ({ style, status: "queued" })));

  const isBusy = appState === "uploading" || appState === "processing";
  const canGenerate = useMemo(() => !!sourceUri && !isBusy, [sourceUri, isBusy]);

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

    const optimized = await manipulateAsync(
      uri,
      [{ resize: { width: outputWidth, height: outputHeight } }],
      {
        compress: 0.72,
        format: SaveFormat.JPEG,
        base64: true
      }
    );

    if (!optimized.base64) {
      throw new Error("Unable to create optimized image payload.");
    }

    return {
      uri: optimized.uri,
      base64: optimized.base64
    };
  };

  const pickImage = async (): Promise<void> => {
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
      setAppState("uploading");
      const optimized = await prepareImageForUpload(asset.uri, asset.width, asset.height);

      setSourceUri(optimized.uri);
      setSourceBase64(optimized.base64);
      setTiles(clipStyles.map((style) => ({ style, status: "queued" })));
      setAppState("idle");
    } catch (_error) {
      setAppState("error");
      Alert.alert("Upload failed", "Could not optimize the selected image.");
    }
  };

  const pollJob = async (job: string): Promise<void> => {
    const interval = setInterval(async () => {
      try {
        const statusResponse = await getJobStatus(job);
        const perStyle = statusResponse.perStyle ?? [];
        const hasAnyDone = perStyle.some((item) => item.status === "completed");
        setTiles(perStyle);
        setAppState(hasAnyDone && statusResponse.status !== "completed" ? "partial" : statusResponse.status);

        if (statusResponse.status === "completed" || statusResponse.status === "error") {
          clearInterval(interval);
          const results = await getJobResults(job);
          setTiles(results.items);
          setAppState(statusResponse.status);
        }
      } catch (_error) {
        clearInterval(interval);
        setAppState("error");
      }
    }, POLL_INTERVAL_MS);
  };

  const generateAll = async (): Promise<void> => {
    if (!sourceUri || !sourceBase64) return;

    try {
      setAppState("uploading");
      setTiles(clipStyles.map((style) => ({ style, status: "processing" })));

      const job = await createJob(
        sourceBase64,
        "image/jpeg",
        512,
        512,
        clipStyles
      );

      setJobId(job.jobId);
      setAppState("processing");
      await pollJob(job.jobId);
    } catch (_error) {
      setAppState("error");
      Alert.alert("Generation failed", "Please retry.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>AI Clipart Generator</Text>
        <Text style={styles.subtitle}>Upload once, generate all styles in parallel.</Text>

        <Pressable style={styles.primaryButton} onPress={pickImage}>
          <Text style={styles.primaryButtonText}>Upload Photo</Text>
        </Pressable>

        {sourceUri ? <Image source={sourceUri} style={styles.preview} contentFit="cover" /> : null}

        <Pressable style={[styles.secondaryButton, !canGenerate && styles.disabled]} onPress={generateAll} disabled={!canGenerate}>
          <Text style={styles.secondaryButtonText}>Generate All Styles</Text>
        </Pressable>

        <Text style={styles.stateText}>State: {appState}</Text>
        {jobId ? <Text style={styles.metaText}>Job: {jobId}</Text> : null}

        <View style={styles.grid}>
          {tiles.map((tile) => (
            <View key={tile.style} style={styles.tile}>
              <Text style={styles.tileTitle}>{tile.style}</Text>
              {tile.status === "completed" && tile.imageBase64 ? (
                <Image source={`data:image/jpeg;base64,${tile.imageBase64}`} style={styles.result} contentFit="cover" />
              ) : (
                <View style={styles.placeholder}>
                  <ActivityIndicator color="#8b5cf6" />
                </View>
              )}
              <Text style={styles.tileStatus}>{tile.status}</Text>
            </View>
          ))}
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
  secondaryButton: {
    marginTop: 12,
    backgroundColor: "#8b5cf6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  secondaryButtonText: {
    color: "#ffffff",
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
  stateText: {
    marginTop: 14,
    color: "#e2e8f0",
    fontWeight: "600"
  },
  metaText: {
    marginTop: 2,
    color: "#94a3b8",
    fontSize: 12
  },
  grid: {
    marginTop: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
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
  placeholder: {
    height: 120,
    borderRadius: 8,
    backgroundColor: "#2d3444",
    justifyContent: "center",
    alignItems: "center"
  },
  result: {
    height: 120,
    borderRadius: 8
  },
  tileStatus: {
    marginTop: 8,
    color: "#a5b4fc",
    fontSize: 12
  }
});
