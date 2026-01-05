// app/(tabs)/_layout.tsx
import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withLayoutContext } from "expo-router";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { COLORS } from "@/src/ui/common";

const { Navigator } = createMaterialTopTabNavigator();
const TopTabs = withLayoutContext(Navigator);

export default function TabsLayout() {
  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <TopTabs
        screenOptions={{
          swipeEnabled: true,
          tabBarStyle: styles.tabBar,
          tabBarIndicatorStyle: styles.indicator,
          tabBarActiveTintColor: "rgba(255,255,255,0.95)",
          tabBarInactiveTintColor: "rgba(255,255,255,0.55)",
          tabBarLabelStyle: styles.label,
        }}
      >
        <TopTabs.Screen name="index" options={{ title: "Dashboard" }} />
        <TopTabs.Screen name="history" options={{ title: "History" }} />
        <TopTabs.Screen name="settings" options={{ title: "Settings" }} />
      </TopTabs>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  tabBar: {
    backgroundColor: COLORS.bg,
    elevation: 0,      // Remove shadow on Android
    shadowOpacity: 0,  // Remove shadow on iOS
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft, // Subtle separator line
  },
  indicator: {
    backgroundColor: "rgba(255,255,255,0.85)",
    height: 3,
  },
  label: {
    fontWeight: "800",
    fontSize: 13,
    textTransform: "capitalize",
  },
});