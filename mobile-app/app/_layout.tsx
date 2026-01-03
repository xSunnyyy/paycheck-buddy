// app/_layout.tsx
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";

import { PayFlowProvider, usePayflow } from "@/src/state/PayFlowProvider";
import { COLORS } from "@/src/ui/common";

function Gate() {
  const router = useRouter();
  const segments = useSegments();
  const { loaded, hasCompletedSetup } = usePayflow();

  const lastRouteKeyRef = useRef<string>("");

  useEffect(() => {
    if (!loaded) return;

    const top = segments[0]; // "(tabs)" | "settings" | undefined
    const inTabs = top === "(tabs)";
    const inSettings = top === "settings";

    const key = `${hasCompletedSetup ? "done" : "setup"}:${top ?? "none"}`;
    if (lastRouteKeyRef.current === key) return;

    if (!hasCompletedSetup && !inSettings) {
      lastRouteKeyRef.current = key;
      router.replace("/settings");
      return;
    }

    if (hasCompletedSetup && !inTabs) {
      lastRouteKeyRef.current = key;
      router.replace("/(tabs)");
      return;
    }

    lastRouteKeyRef.current = key;
  }, [loaded, hasCompletedSetup, segments, router]);

  if (!loaded) {
    return (
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: COLORS.bg,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  return null;
}

export default function RootLayout() {
  return (
    <PayFlowProvider>
      <Gate />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      </Stack>
    </PayFlowProvider>
  );
}
