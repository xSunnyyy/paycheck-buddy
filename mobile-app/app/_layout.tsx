// app/_layout.tsx
import React from "react";
import { Stack } from "expo-router";
import { PayFlowProvider } from "@/src/state/PayFlowProvider";

export default function RootLayout() {
  return (
    <PayFlowProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* Keep this only if you still use /modal somewhere */}
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      </Stack>
    </PayFlowProvider>
  );
}
