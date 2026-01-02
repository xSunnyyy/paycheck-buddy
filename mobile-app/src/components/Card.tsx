import React from "react";
import { View } from "react-native";

export default function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.06)",
        padding: 14,
      }}
    >
      {children}
    </View>
  );
}
