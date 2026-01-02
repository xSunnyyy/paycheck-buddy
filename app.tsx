import "react-native-gesture-handler";
import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StoreProvider, useStore } from "./src/Store";
import SetupScreen from "./src/screens/SetupScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { View, ActivityIndicator } from "react-native";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#070A10",
    card: "#070A10",
    text: "#E5E7EB",
    border: "rgba(255,255,255,0.12)",
    primary: "#22C55E",
  },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#070A10" },
        headerTitleStyle: { color: "#E5E7EB", fontWeight: "900" },
        tabBarStyle: { backgroundColor: "#070A10", borderTopColor: "rgba(255,255,255,0.12)" },
        tabBarActiveTintColor: "#22C55E",
        tabBarInactiveTintColor: "rgba(229,231,235,0.65)",
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function RootNav() {
  const { state } = useStore();

  if (state.booting) {
    return (
      <View style={{ flex: 1, backgroundColor: "#070A10", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // If not configured, force setup first
  const needsSetup = !state.profile?.isConfigured;

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#070A10" },
        headerTitleStyle: { color: "#E5E7EB", fontWeight: "900" },
        headerTintColor: "#E5E7EB",
      }}
    >
      {needsSetup ? (
        <Stack.Screen name="Setup" component={SetupScreen} options={{ title: "Setup" }} />
      ) : (
        <>
          <Stack.Screen name="Home" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="Setup" component={SetupScreen} options={{ title: "Setup" }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <NavigationContainer theme={navTheme}>
        <RootNav />
      </NavigationContainer>
    </StoreProvider>
  );
}
