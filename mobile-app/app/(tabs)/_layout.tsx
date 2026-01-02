import React from "react";
import { Platform } from "react-native";
import { withLayoutContext } from "expo-router";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Fonts } from "@/constants/theme";

const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator);

export default function TabsLayout() {
  return (
    <MaterialTopTabs
      screenOptions={{
        swipeEnabled: true,
        animationEnabled: true,
        lazy: true,

        tabBarScrollEnabled: false,
        tabBarIndicatorStyle: { height: 3, backgroundColor: "#FFFFFF" },
        tabBarStyle: {
          backgroundColor: "#070A10",
          paddingTop: Platform.OS === "android" ? 10 : 0,
        },
        tabBarLabelStyle: {
          textTransform: "none",
          fontFamily: Fonts?.rounded ?? undefined,
          fontSize: 14,
        },
        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "rgba(255,255,255,0.6)",
      }}
    >
      <MaterialTopTabs.Screen name="index" options={{ title: "Dashboard" }} />
      <MaterialTopTabs.Screen name="history" options={{ title: "History" }} />
      <MaterialTopTabs.Screen name="settings" options={{ title: "Settings" }} />
    </MaterialTopTabs>
  );
}
