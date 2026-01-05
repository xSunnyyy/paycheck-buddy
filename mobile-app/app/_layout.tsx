// app/_layout.tsx
import React, { useEffect } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { PayFlowProvider, usePayflow } from "@/src/state/PayFlowProvider";
import { COLORS } from "@/src/ui/common";

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { loaded, hasCompletedSetup } = usePayflow();

  useEffect(() => {
    if (!loaded) return;

    const inSettings = segments[0] === "settings";

    // ✅ LOGIC FIX:
    // Only force redirect if setup is NOT complete.
    // If setup IS complete, let the user navigate wherever they want (Tabs or Settings).
    if (!hasCompletedSetup && !inSettings) {
      router.replace("/settings");
    }
  }, [loaded, hasCompletedSetup, segments]);

  if (!loaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.text} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <PayFlowProvider>
      {/* ✅ Sets white text on status bar globally */}
      <StatusBar style="light" />
      <RootLayoutNav />
    </PayFlowProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});