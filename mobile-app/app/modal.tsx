// app/modal.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";

import { usePayflow } from "@/src/state/PayFlowProvider";
import { Card, COLORS, TextBtn, TYPE, Divider } from "@/src/ui/common";

export default function ModalScreen() {
  const router = useRouter();
  const { setHasCompletedSetup, resetEverything } = usePayflow();

  const handleFinishSetup = () => {
    setHasCompletedSetup(true);
    router.replace("/(tabs)");
  };

  const handleReset = async () => {
    await resetEverything();
    router.replace("/settings"); // Go back to setup start
  };

  return (
    <View style={styles.container}>
      {/* Use light status bar for the modal */}
      <StatusBar style="light" />

      <Card>
        <Text style={styles.title}>Developer Menu</Text>
        <Text style={styles.subtitle}>
          Use this screen to quickly test app states without going through the full flow.
        </Text>

        <Divider />

        <View style={{ gap: 12 }}>
          <TextBtn 
            label="Force 'Setup Complete' (Jump to Dashboard)" 
            onPress={handleFinishSetup} 
            kind="green" 
          />

          <TextBtn 
            label="Reset App Data (Clear Cache)" 
            onPress={handleReset} 
            kind="red" 
          />
          
          <TextBtn 
            label="Close Modal" 
            onPress={() => router.back()} 
          />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    color: COLORS.textStrong,
    textAlign: "center",
    marginBottom: 8,
    ...TYPE.h1,
  },
  subtitle: {
    color: COLORS.muted,
    textAlign: "center",
    marginBottom: 16,
    ...TYPE.body,
  },
});