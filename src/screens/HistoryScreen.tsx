import React from "react";
import { ScrollView, Text, View, Pressable } from "react-native";
import Card from "../components/Card";
import Chip from "../components/Chip";
import ProgressBar from "../components/ProgressBar";
import { useStore } from "../Store";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function HistoryScreen() {
  const { state, dispatch } = useStore();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#070A10" }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Card>
        <Text style={{ color: "white", fontWeight: "950", fontSize: 16 }}>History</Text>
        <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700", marginTop: 6 }}>
          Past paychecks (archived automatically when a new payday starts).
        </Text>

        <View style={{ height: 12 }} />
        <Pressable
          onPress={() => dispatch({ type: "ARCHIVE_IF_NEEDED" })}
          style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.05)" }}
        >
          <Text style={{ color: "rgba(244,245,247,0.95)", fontWeight: "950", textAlign: "center" }}>Check for new payday</Text>
        </Pressable>
      </Card>

      {state.history.length === 0 ? (
        <Card>
          <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700" }}>No history yet.</Text>
        </Card>
      ) : (
        state.history.map((h) => (
          <Card key={h.cycleKey}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "white", fontWeight: "950" }}>{fmtDate(h.paydayISO)}</Text>
                <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700", marginTop: 4 }}>
                  {h.totals.itemsDone}/{h.totals.itemsTotal} • {h.totals.pct}%
                </Text>
              </View>
              <Chip>{money(h.totals.done)}</Chip>
            </View>

            <View style={{ height: 10 }} />
            <ProgressBar pct={h.totals.pct} />

            <View style={{ height: 10 }} />
            <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700" }}>
              Debt paid: {money(h.totals.debtPaid || 0)}
            </Text>
          </Card>
        ))
      )}

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}
