import { SafeAreaProvider } from "react-native-safe-area-context";
import GenerationScreen from "./src/features/generation/GenerationScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      <GenerationScreen />
    </SafeAreaProvider>
  );
}
