import React, { useMemo, useState } from "react";
import { ScrollView, StatusBar, Text, View, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { usePayflow, buildChecklistForCycle, fmtMoney, formatDate, displayCategory } from "@/src/state/usePayflow";
import { Card, Chip, COLORS, Divider, TextBtn, TYPE } from "@/src/ui/common";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const {
    loaded,
    hasCompletedSetup,
    last10Cycles,
    settings,
    getCycleChecked,
    getCycleUnexpectedTotal,
    unexpectedByCycle, // NOTE: not exposed currently; so we compute using helper
  } = usePayflow() as any;

  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  const selectedCycle = useMemo(() => {
    if (!selectedCycleId) return null;
    return last10Cycles.find((c: any) => c.id === selectedCycleId) ?? null;
  }, [selectedCycleId, last10Cycles]);

  if (!loaded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasCompletedSetup) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={{ flex: 1, padding: 16, paddingTop: 10 + insets.top }}>
          <Card>
            <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>History</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
              Complete setup in Settings to start tracking cycles.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 + insets.bottom }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}>
          {selectedCycle ? (
            <HistoryDetail
              cycle={selectedCycle}
              settings={settings}
              getCycleChecked={getCycleChecked}
              getCycleUnexpectedTotal={getCycleUnexpectedTotal}
              onBack={() => setSelectedCycleId(null)}
            />
          ) : (
            <HistoryList
              cycles={last10Cycles}
              settings={settings}
              getCycleChecked={getCycleChecked}
              getCycleUnexpectedTotal={getCycleUnexpectedTotal}
              onSelect={(id) => setSelectedCycleId(id)}
            />
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function HistoryList({
  cycles,
  settings,
  getCycleChecked,
  getCycleUnexpectedTotal,
  onSelect,
}: any) {
  return (
    <>
      <Card>
        <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>History</Text>
        <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
          Last 10 pay cycles. Tap one to view details.
        </Text>
      </Card>

      <View style={{ marginTop: 12, gap: 12 }}>
        {cycles.map((c: any, idx: number) => {
          const uxTot = getCycleUnexpectedTotal(c.id);
          const its = buildChecklistForCycle(settings, c, uxTot);
          const checked = getCycleChecked(c.id);

          const planned = its.reduce((sum: number, i: any) => sum + (i.amount || 0), 0);
          const done = its.reduce((sum: number, i: any) => (checked[i.id]?.checked ? sum + (i.amount || 0) : sum), 0);

          const totalCount = its.length;
          const doneCount = its.filter((i: any) => checked[i.id]?.checked).length;
          const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

          const metGoal = pct === 100;

          return (
            <Pressable key={c.id} onPress={() => onSelect(c.id)}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>
                      {idx === 0 ? "Current cycle" : `Cycle #${idx + 1}`} • {formatDate(c.payday)}
                    </Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>{c.label}</Text>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={{
                        color: metGoal ? "rgba(34,197,94,0.95)" : "rgba(251,191,36,0.95)",
                        fontWeight: "900",
                      }}
                    >
                      {metGoal ? "GOAL MET" : "INCOMPLETE"}
                    </Text>
                    <Text style={{ color: COLORS.muted, fontWeight: "700", marginTop: 4 }}>
                      {doneCount}/{totalCount} ({pct}%)
                    </Text>
                  </View>
                </View>

                <Divider />

                <View style={{ gap: 8 }}>
                  <Row label="Planned" value={fmtMoney(planned)} />
                  <Row label="Completed" value={fmtMoney(done)} />
                  <Row label="Unexpected" value={fmtMoney(uxTot)} />
                </View>

                <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                  <TextBtn label="View details" kind="green" onPress={() => onSelect(c.id)} />
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ color: COLORS.faint, marginTop: 14, textAlign: "center", fontWeight: "700" }}>
        Offline • Saved on-device
      </Text>
    </>
  );
}

function HistoryDetail({ cycle, settings, getCycleChecked, getCycleUnexpectedTotal, onBack }: any) {
  const uxTot = getCycleUnexpectedTotal(cycle.id);
  const its = buildChecklistForCycle(settings, cycle, uxTot);
  const checked = getCycleChecked(cycle.id);

  const planned = its.reduce((sum: number, i: any) => sum + (i.amount || 0), 0);
  const done = its.reduce((sum: number, i: any) => (checked[i.id]?.checked ? sum + (i.amount || 0) : sum), 0);

  const totalCount = its.length;
  const doneCount = its.filter((i: any) => checked[i.id]?.checked).length;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const metGoal = pct === 100;

  const bills = its.filter((i: any) => i.category === "Bills");
  const billsPaid = bills.filter((b: any) => !!checked[b.id]?.checked);
  const billsMissed = bills.filter((b: any) => !checked[b.id]?.checked);
  const missedItems = its.filter((i: any) => !checked[i.id]?.checked);

  return (
    <>
      <Card>
        <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Cycle details</Text>
        <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
          {cycle.label} • Payday {formatDate(cycle.payday)}
        </Text>

        <Divider />

        <Row label="Goal" value={metGoal ? "Met ✅" : "Not met ⚠️"} />
        <Row label="Progress" value={`${doneCount}/${totalCount} (${pct}%)`} />
        <Row label="Planned" value={fmtMoney(planned)} />
        <Row label="Completed" value={fmtMoney(done)} />
        <Row label="Unexpected" value={fmtMoney(uxTot)} />

        <Divider />

        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <TextBtn label="Back to history" onPress={onBack} />
        </View>
      </Card>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Bills</Text>
          <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
            Paid: {billsPaid.length} • Missed: {billsMissed.length}
          </Text>

          <Divider />

          {bills.length === 0 ? (
            <Text style={{ color: COLORS.muted, fontWeight: "700" }}>No bills fell due in this cycle.</Text>
          ) : (
            <>
              {billsPaid.length > 0 ? (
                <>
                  <Text style={{ color: "rgba(34,197,94,0.95)", fontWeight: "900" }}>Paid</Text>
                  <View style={{ gap: 10, marginTop: 8 }}>
                    {billsPaid.map((b: any) => (
                      <View
                        key={b.id}
                        style={{
                          padding: 12,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.09)",
                          backgroundColor: "rgba(34,197,94,0.16)",
                        }}
                      >
                        <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>✅ {b.label}</Text>
                        <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                          {fmtMoney(b.amount)}{b.notes ? ` • ${b.notes}` : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {billsMissed.length > 0 ? (
                <>
                  <Divider />
                  <Text style={{ color: "rgba(251,191,36,0.95)", fontWeight: "900" }}>Missed</Text>
                  <View style={{ gap: 10, marginTop: 8 }}>
                    {billsMissed.map((b: any) => (
                      <View
                        key={b.id}
                        style={{
                          padding: 12,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.09)",
                          backgroundColor: "rgba(251,191,36,0.15)",
                        }}
                      >
                        <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>⬜ {b.label}</Text>
                        <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                          {fmtMoney(b.amount)}{b.notes ? ` • ${b.notes}` : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          )}
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Missed items</Text>
          <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>Anything not checked in that cycle.</Text>

          <Divider />

          {missedItems.length === 0 ? (
            <Text style={{ color: COLORS.muted, fontWeight: "700" }}>None — you completed everything ✅</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {missedItems.map((i: any) => (
                <View
                  key={i.id}
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.09)",
                    backgroundColor: "rgba(251,191,36,0.15)",
                  }}
                >
                  <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>⬜ {i.label}</Text>
                  <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                    {fmtMoney(i.amount)} • {displayCategory(i.category)}
                    {i.notes ? ` • ${i.notes}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </View>

      <Text style={{ color: COLORS.faint, marginTop: 14, textAlign: "center", fontWeight: "700" }}>
        Offline • Saved on-device
      </Text>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: COLORS.muted, ...TYPE.label }}>{label}</Text>
      <Chip>{value}</Chip>
    </View>
  );
}
