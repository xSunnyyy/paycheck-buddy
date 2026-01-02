import React, { useMemo } from "react";
import { ScrollView, Text, View, Pressable } from "react-native";
import Card from "../components/Card";
import Chip from "../components/Chip";
import ProgressBar from "../components/ProgressBar";
import RowItem from "../components/RowItem";
import { useStore } from "../Store";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function DashboardScreen({ navigation }: any) {
  const { state, dispatch, getChecklist } = useStore();
  const profile = state.profile;

  if (!profile) return null;

  const paydayISO = state.activePaydayISO;
  const items = getChecklist(paydayISO);

  const checked = state.checkedByPayday[paydayISO] ?? {};

  const totals = useMemo(() => {
    const planned = items.reduce((s, i) => s + i.amount, 0);
    const done = items.reduce((s, i) => (checked[i.id]?.checked ? s + i.amount : s), 0);
    const itemsTotal = items.length;
    const itemsDone = items.filter((i) => checked[i.id]?.checked).length;
    const pct = itemsTotal ? Math.round((itemsDone / itemsTotal) * 100) : 0;
    const debtItem = items.find((i) => i.category === "Debt");
    const debtThisPaycheck = debtItem?.amount ?? 0;
    return { planned, done, itemsTotal, itemsDone, pct, debtThisPaycheck };
  }, [items, checked]);

  function toggle(itemId: string) {
    const next = { ...checked };
    const was = next[itemId]?.checked ?? false;
    next[itemId] = { checked: !was, at: !was ? new Date().toISOString() : undefined };
    dispatch({ type: "SET_CHECKED", paydayISO, checked: next });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#070A10" }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.98)", fontWeight: "950", fontSize: 16 }}>Today</Text>
            <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700", marginTop: 4 }}>
              Payday: {fmtDate(paydayISO)}
            </Text>
          </View>
          <Chip>{money(profile.payPerPaycheck)}</Chip>
        </View>

        <View style={{ height: 14 }} />

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 160, padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
            <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700" }}>Planned</Text>
            <Text style={{ color: "white", fontWeight: "950", fontSize: 20, marginTop: 6 }}>{money(totals.planned)}</Text>
          </View>

          <View style={{ flex: 1, minWidth: 160, padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
            <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700" }}>Completed</Text>
            <Text style={{ color: "white", fontWeight: "950", fontSize: 20, marginTop: 6 }}>{money(totals.done)}</Text>
          </View>

          <View style={{ flex: 1, minWidth: 160, padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
            <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700" }}>Debt this paycheck</Text>
            <Text style={{ color: "white", fontWeight: "950", fontSize: 20, marginTop: 6 }}>{money(totals.debtThisPaycheck)}</Text>
          </View>

          <View style={{ flex: 1, minWidth: 160, padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
            <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700" }}>Debt remaining</Text>
            <Text style={{ color: "white", fontWeight: "950", fontSize: 20, marginTop: 6 }}>{money(state.debtBalance)}</Text>
          </View>
        </View>

        <View style={{ height: 12 }} />
        <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700" }}>
          Progress: {totals.itemsDone}/{totals.itemsTotal} ({totals.pct}%)
        </Text>
        <View style={{ height: 10 }} />
        <ProgressBar pct={totals.pct} />
      </Card>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: "white", fontWeight: "950", fontSize: 16 }}>Checklist</Text>
          <Pressable
            onPress={() => dispatch({ type: "ARCHIVE_IF_NEEDED" })}
            style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
          >
            <Text style={{ color: "rgba(244,245,247,0.95)", fontWeight: "900" }}>Refresh</Text>
          </Pressable>
        </View>

        <View style={{ height: 12 }} />

        <View style={{ gap: 10 }}>
          {items.map((it) => (
            <RowItem
              key={it.id}
              label={it.label}
              sub={it.notes}
              amountText={money(it.amount)}
              checked={!!checked[it.id]?.checked}
              onToggle={() => toggle(it.id)}
            />
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => navigation.navigate("Setup")}
          style={{ flex: 1, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.05)" }}
        >
          <Text style={{ color: "rgba(244,245,247,0.95)", fontWeight: "950", textAlign: "center" }}>Edit Setup</Text>
        </Pressable>

        <Pressable
          onPress={() => dispatch({ type: "MANUAL_SET_DEBT", debtBalance: state.debtBalance })}
          style={{ flex: 1, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(34,197,94,0.30)", backgroundColor: "rgba(34,197,94,0.14)" }}
        >
          <Text style={{ color: "rgba(236,253,245,1)", fontWeight: "950", textAlign: "center" }}>Save</Text>
        </Pressable>
      </View>

      <Text style={{ color: "rgba(185,193,204,0.60)", textAlign: "center", fontWeight: "700", marginTop: 6 }}>
        Debt Budget by Sunny.
      </Text>

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}
