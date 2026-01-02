// app/_layout.tsx
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useSegments, useRouter } from "expo-router";

import { PayFlowProvider, usePayflow } from "@/src/state/PayFlowProvider";
import { COLORS } from "@/src/ui/common";

/**
 * This component handles routing decisions
 * AFTER PayFlowProvider has loaded state.
 */
function Gate() {
  const router = useRouter();
  const segments = useSegments();

  const { loaded, hasCompletedSetup } = usePayflow();

  // Wait until AsyncStorage is loaded
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

  const top = segments[0]; // "(tabs)" | "modal" | undefined
  const inTabs = top === "(tabs)";

  // 🔐 Setup gate
  if (!hasCompletedSetup && inTabs) {
    router.replace("/settings");
    return null;
  }

  if (hasCompletedSetup && !inTabs) {
    router.replace("/(tabs)");
    return null;
  }

  return null;
}

export default function RootLayout() {
  return (
    <PayFlowProvider>
      <Gate />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* Optional modal support */}
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      </Stack>
    </PayFlowProvider>
  );
}
