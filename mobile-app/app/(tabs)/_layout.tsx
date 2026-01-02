// app/(tabs)/_layout.tsx
import React from "react";
import { Platform, StatusBar, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { withLayoutContext } from "expo-router";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { COLORS } from "@/src/ui/common";

const { Navigator } = createMaterialTopTabNavigator();
const TopTabs = withLayoutContext(Navigator);

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <StatusBar
        translucent={Platform.OS === "android"}
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* Push content below status bar on Android (folds/immersive) */}
      <View style={{ flex: 1, paddingTop: Platform.OS === "android" ? insets.top : 0 }}>
        <TopTabs
          screenOptions={{
            swipeEnabled: true,
            tabBarStyle: { backgroundColor: COLORS.bg },
            tabBarIndicatorStyle: { backgroundColor: "rgba(255,255,255,0.85)" },
            tabBarActiveTintColor: "rgba(255,255,255,0.95)",
            tabBarInactiveTintColor: "rgba(255,255,255,0.55)",
            tabBarLabelStyle: { fontWeight: "900" },
          }}
        >
          {/* expo-router file names */}
          <TopTabs.Screen name="index" options={{ title: "Dashboard" }} />
          <TopTabs.Screen name="history" options={{ title: "History" }} />
          <TopTabs.Screen name="settings" options={{ title: "Settings" }} />
        </TopTabs>
      </View>
    </SafeAreaView>
  );
}
