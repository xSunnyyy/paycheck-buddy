import { StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { setSetupComplete } from "@/src/storage/setup";

export default function ModalScreen() {
  const router = useRouter();

  const finishSetup = async () => {
    // Mark setup as complete
    await setSetupComplete(true);

    // Replace prevents going back to setup
    router.replace("/(tabs)");
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Setup</ThemedText>

      <ThemedText style={styles.subtitle}>
        Finish setting up PayFlow to continue.
      </ThemedText>

      {/* Your real setup form can live here */}
      {/* <SetupForm /> */}

      <Pressable onPress={finishSetup} style={styles.button}>
        <ThemedText type="link" style={styles.buttonText}>
          Finish Setup
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  subtitle: {
    marginTop: 12,
    textAlign: "center",
    opacity: 0.8,
  },
  button: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: "#000",
  },
  buttonText: {
    color: "#fff",
  },
});
