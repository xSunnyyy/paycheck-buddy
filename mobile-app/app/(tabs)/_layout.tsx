// mobile-app/app/(tabs)/_layout.tsx
import React from "react";
import { StatusBar, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import { COLORS } from "@/src/ui/common";

export default function TabsLayout() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <StatusBar
        translucent={false}
        backgroundColor={Platform.OS === "android" ? COLORS.bg : undefined}
        barStyle="light-content"
      />

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: COLORS.bg },
          sceneStyle: { backgroundColor: COLORS.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
        <Tabs.Screen name="history" options={{ title: "History" }} />
        <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      </Tabs>
    </SafeAreaView>
  );
}
