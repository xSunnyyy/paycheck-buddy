// app/_layout.tsx
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";

import { usePayflow } from "@/src/state/usePayflow";
import { COLORS } from "@/src/ui/common";

/**
 * Gate: routes based on setup completion.
 * IMPORTANT:
 * - No provider here (single source of truth is usePayflow.ts)
 * - Never navigate during render; only inside useEffect
 */
function Gate() {
  const router = useRouter();
  const segments = useSegments();
  const hasRoutedRef = useRef(false);

  const { loaded, hasCompletedSetup } = usePayflow();

  // show a simple loader while AsyncStorage loads
  if (!loaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  useEffect(() => {
    // Prevent double-routing loops (especially on Android release builds)
    if (hasRoutedRef.current) return;

    const top = segments[0]; // "(tabs)" | "settings" | undefined
    const inTabs = top === "(tabs)";
    const inSettings = top === "settings";

    // If setup NOT done, always go to /settings
    if (!hasCompletedSetup && !inSettings) {
      hasRoutedRef.current = true;
      router.replace("/settings");
      return;
    }

    // If setup IS done, always go to /(tabs)
    if (hasCompletedSetup && !inTabs) {
      hasRoutedRef.current = true;
      router.replace("/(tabs)");
      return;
    }

    // If already in the correct place, do nothing
  }, [loaded, hasCompletedSetup, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <>
      <Gate />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        {/* Optional modal support */}
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}
