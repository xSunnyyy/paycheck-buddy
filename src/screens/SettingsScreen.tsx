import React, { useState } from "react";
import { ScrollView, Text, View, Pressable, TextInput, Alert } from "react-native";
import Card from "../components/Card";
import { useStore } from "../Store";
import { wipeStorage } from "../storage";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

export default function SettingsScreen({ navigation }: any) {
  const { state, dispatch } = useStore();
  const [debt, setDebt] = useState(String(state.debtBalance));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#070A10" }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Card>
        <Text style={{ color: "white", fontWeight: "950", fontSize: 16 }}>Settings</Text>
        <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700", marginTop: 6 }}>
          Current debt remaining: {money(state.debtBalance)}
        </Text>

        <View style={{ height: 12 }} />
        <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700" }}>Manual debt override</Text>
        <TextInput
          value={debt}
          onChangeText={setDebt}
          keyboardType="numeric"
          style={{
            marginTop: 8,
            color: "rgba(244,245,247,0.95)",
            padding: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.05)",
          }}
        />

        <View style={{ height: 12 }} />
        <Pressable
          onPress={() => {
            const n = Number(debt);
            if (!Number.isFinite(n) || n < 0) return Alert.alert("Invalid", "Debt must be 0 or more.");
            dispatch({ type: "MANUAL_SET_DEBT", debtBalance: n });
          }}
          style={{
            padding: 12,
            borderRadius: 14,
            backgroundColor: "rgba(34,197,94,0.16)",
            borderWidth: 1,
            borderColor: "rgba(34,197,94,0.30)",
          }}
        >
          <Text style={{ color: "rgba(236,253,245,1)", fontWeight: "950", textAlign: "center" }}>Save debt</Text>
        </Pressable>
      </Card>

      <Card>
        <Pressable
          onPress={() => navigation.navigate("Setup")}
          style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.05)" }}
        >
          <Text style={{ color: "rgba(244,245,247,0.95)", fontWeight: "950", textAlign: "center" }}>Edit Setup</Text>
        </Pressable>

        <View style={{ height: 10 }} />
        <Pressable
          onPress={async () => {
            Alert.alert("Reset everything?", "This clears all saved data.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Reset",
                style: "destructive",
                onPress: async () => {
                  await wipeStorage();
                  dispatch({ type: "RESET_ALL" });
                },
              },
            ]);
          }}
          style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(248,113,113,0.35)", backgroundColor: "rgba(248,113,113,0.12)" }}
        >
          <Text style={{ color: "rgba(254,202,202,1)", fontWeight: "950", textAlign: "center" }}>Reset app data</Text>
        </Pressable>
      </Card>

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}
