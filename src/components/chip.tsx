import React from "react";
import { Text, View } from "react-native";

export default function Chip({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.07)",
      }}
    >
      <Text style={{ color: "rgba(244,245,247,0.95)", fontWeight: "800" }}>{children as any}</Text>
    </View>
  );
}
