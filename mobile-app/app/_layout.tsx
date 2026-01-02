import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";

import { getSetupComplete } from "@/src/storage/setup";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const [ready, setReady] = useState(false);
  const [setupComplete, setSetupCompleteState] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const done = await getSetupComplete();
      if (!alive) return;
      setSetupCompleteState(done);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    const top = segments[0]; // "(tabs)" | "modal" | "setup" | etc
    const isInSetup = top === "modal" || top === "setup";

    // Not set up yet → force setup
    if (!setupComplete && !isInSetup) {
      router.replace("/modal");
      return;
    }

    // Already set up → don't allow returning to setup
    if (setupComplete && isInSetup) {
      router.replace("/(tabs)");
    }
  }, [ready, setupComplete, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}
