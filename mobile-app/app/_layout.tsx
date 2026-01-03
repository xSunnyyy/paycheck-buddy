// app/_layout.tsx
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";

import { usePayflow } from "@/src/state/usePayflow";
import { COLORS } from "@/src/ui/common";

function Gate() {
  const router = useRouter();
  const segments = useSegments();

  const { loaded, hasCompletedSetup } = usePayflow();

  // prevent repeated replace() calls for the same state/location combo
  const lastRouteKeyRef = useRef<string>("");

  useEffect(() => {
    if (!loaded) return;

    const top = segments[0]; // "(tabs)" | "settings" | undefined
    const inTabs = top === "(tabs)";
    const inSettings = top === "settings";

    // Build a key that represents "what we are" + "where we are"
    const key = `${hasCompletedSetup ? "done" : "setup"}:${top ?? "none"}`;

    // If we already routed for this exact combo, don't spam replace()
    if (lastRouteKeyRef.current === key) return;

    // If setup is NOT complete, force user into /settings
    if (!hasCompletedSetup && !inSettings) {
      lastRouteKeyRef.current = key;
      router.replace("/settings");
      return;
    }

    // If setup IS complete, force user into /(tabs)
    if (hasCompletedSetup && !inTabs) {
      lastRouteKeyRef.current = key;
      router.replace("/(tabs)");
      return;
    }

    // We're already in the right place
    lastRouteKeyRef.current = key;
  }, [loaded, hasCompletedSetup, segments, router]);

  // Loader overlay while AsyncStorage loads
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
    <>
      <Gate />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}
