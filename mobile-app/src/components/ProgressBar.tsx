import React from "react";
import { View } from "react-native";

export default function ProgressBar({ pct }: { pct: number }) {
  const widthPct = Math.max(0, Math.min(100, pct));
  return (
    <View
      style={{
        height: 10,
        borderRadius: 999,
        overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <View style={{ width: `${widthPct}%`, height: 10, backgroundColor: "#22C55E" }} />
    </View>
  );
}
