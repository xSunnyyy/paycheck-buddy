import React from "react";
import { Text, View, Pressable } from "react-native";
import Chip from "./Chip";

export default function RowItem({
  label,
  sub,
  amountText,
  checked,
  onToggle,
}: {
  label: string;
  sub?: string;
  amountText: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={{
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: checked ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.03)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: "rgba(255,255,255,0.98)", fontWeight: "900" }}>
          {checked ? "✅ " : "⬜ "} {label}
        </Text>
        {!!sub && <Text style={{ marginTop: 3, color: "rgba(185,193,204,0.82)", fontWeight: "600" }}>{sub}</Text>}
      </View>
      <Chip>{amountText}</Chip>
    </Pressable>
  );
}
