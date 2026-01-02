// src/screens/HistoryScreen.tsx
import React, { useMemo, useState } from "react";
import { ScrollView, Text, View, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { usePayflow } from "@/src/state/PayFlowProvider";
import {
  buildChecklistForCycle,
  fmtMoney,
  formatDate,
  displayCategory,
  getLastNCycles,
  Cycle,
} from "@/src/state/payflowHelpers";

import { Card, Chip, COLORS, Divider, TextBtn, TYPE } from "@/src/ui/common";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { loaded, hasCompletedSetup, settings, checkedByCycle, unexpectedByCycle } = usePayflow();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const last10 = useMemo(() => {
    if (!hasCompletedSetup) return [];
    return getLastNCycles(settings, new Date(), 10);
  }, [hasCompletedSetup, settings]);

  const selectedCycle = useMemo(() => {
    if (!selectedId) return null;
    return last10.find((c) => c.id === selectedId) ?? null;
  }, [selectedId, last10]);

  const getCycleUnexpectedTotal = (cycleId: string) => {
    const arr = unexpectedByCycle[cycleId] ?? [];
    return arr.reduce((sum, x) => sum + (x.amount || 0), 0);
  };

  const getCycleChecked = (cycleId: string) => checkedByCycle[cycleId] ?? {};

  if (!loaded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasCompletedSetup) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <View style={{ flex: 1, padding: 16, paddingTop: 12 + insets.top }}>
          <Card>
            <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>History</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
              Finish setup in the Settings tab to start tracking pay cycles.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------- Details view --------------------
  if (selectedCycle) {
    const c = selectedCycle;
    const uxArr = unexpectedByCycle[c.id] ?? [];
    const uxTot = getCycleUnexpectedTotal(c.id);

    const its = buildChecklistForCycle(settings, c, uxTot);
    const checked = getCycleChecked(c.id);

    const planned = its.reduce((sum, i) => sum + (i.amount || 0), 0);
    const done = its.reduce((sum, i) => (checked[i.id]?.checked ? sum + (i.amount || 0) : sum), 0);

    const totalCount = its.length;
    const doneCount = its.filter((i) => checked[i.id]?.checked).length;
    const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
    const metGoal = pct === 100;

    const bills = its.filter((i) => i.category === "Bills");
    const billsPaid = bills.filter((b) => !!checked[b.id]?.checked);
    const billsMissed = bills.filter((b) => !checked[b.id]?.checked);
    const missedItems = its.filter((i) => !checked[i.id]?.checked);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <ScrollView
          style={{ flex: 1, backgroundColor: COLORS.bg }}
          contentContainerStyle={{ padding: 16, paddingTop: 12 + insets.top, paddingBottom: 24 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <Card>
            <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Cycle details</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
              {c.label} • Payday {formatDate(c.payday)}
            </Text>

            <Divider />

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: COLORS.muted, ...TYPE.label }}>Goal</Text>
              <Chip>{metGoal ? "Met ✅" : "Not met ⚠️"}</Chip>
            </View>

            <View style={{ marginTop: 10, gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: COLORS.muted, ...TYPE.label }}>Progress</Text>
                <Chip>
                  {doneCount}/{totalCount} ({pct}%)
                </Chip>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: COLORS.muted, ...TYPE.label }}>Planned</Text>
                <Chip>{fmtMoney(planned)}</Chip>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: COLORS.muted, ...TYPE.label }}>Completed</Text>
                <Chip>{fmtMoney(done)}</Chip>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: COLORS.muted, ...TYPE.label }}>Unexpected</Text>
                <Chip>{fmtMoney(uxTot)}</Chip>
              </View>
            </View>

            <Divider />

            <TextBtn label="Back to history" onPress={() => setSelectedId(null)} />
          </Card>

          <View style={{ marginTop: 12 }}>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Unexpected expenses</Text>
                <Chip>{fmtMoney(uxTot)}</Chip>
              </View>

              <Divider />

              {uxArr.length === 0 ? (
                <Text style={{ color: COLORS.muted, fontWeight: "700" }}>None recorded for this cycle.</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {uxArr.map((x) => (
                    <View
                      key={x.id}
                      style={{
                        padding: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: COLORS.borderSoft,
                        backgroundColor: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>{x.label}</Text>
                      <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                        {fmtMoney(x.amount)} • {new Date(x.atISO).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </View>

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
                        {billsPaid.map((b) => (
                          <View
                            key={b.id}
                            style={{
                              padding: 12,
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: COLORS.borderSoft,
                              backgroundColor: COLORS.greenSoft,
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
                        {billsMissed.map((b) => (
                          <View
                            key={b.id}
                            style={{
                              padding: 12,
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: COLORS.borderSoft,
                              backgroundColor: COLORS.amberSoft,
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
              <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                Anything not checked in that cycle.
              </Text>

              <Divider />

              {missedItems.length === 0 ? (
                <Text style={{ color: COLORS.muted, fontWeight: "700" }}>None — you completed everything ✅</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {missedItems.map((i) => (
                    <View
                      key={i.id}
                      style={{
                        padding: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: COLORS.borderSoft,
                        backgroundColor: COLORS.amberSoft,
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
        </ScrollView>
      </SafeAreaView>
    );
  }

  // -------------------- List view --------------------
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.bg }}
        contentContainerStyle={{ padding: 16, paddingTop: 12 + insets.top, paddingBottom: 24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>History</Text>
          <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
            Last 10 pay cycles. Tap one to view what you paid, missed, and unexpected expenses.
          </Text>
        </Card>

        <View style={{ marginTop: 12, gap: 12 }}>
          {last10.map((c: Cycle, idx: number) => {
            const uxTot = getCycleUnexpectedTotal(c.id);
            const its = buildChecklistForCycle(settings, c, uxTot);
            const checked = getCycleChecked(c.id);

            const planned = its.reduce((sum, i) => sum + (i.amount || 0), 0);
            const done = its.reduce((sum, i) => (checked[i.id]?.checked ? sum + (i.amount || 0) : sum), 0);

            const totalCount = its.length;
            const doneCount = its.filter((i) => checked[i.id]?.checked).length;
            const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
            const metGoal = pct === 100;

            return (
              <Pressable key={c.id} onPress={() => setSelectedId(c.id)}>
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
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: COLORS.muted, ...TYPE.label }}>Planned</Text>
                      <Chip>{fmtMoney(planned)}</Chip>
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: COLORS.muted, ...TYPE.label }}>Completed</Text>
                      <Chip>{fmtMoney(done)}</Chip>
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: COLORS.muted, ...TYPE.label }}>Unexpected</Text>
                      <Chip>{fmtMoney(uxTot)}</Chip>
                    </View>
                  </View>

                  <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                    <TextBtn label="View details" onPress={() => setSelectedId(c.id)} kind="green" />
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: COLORS.faint, marginTop: 14, textAlign: "center", fontWeight: "700" }}>
          Offline • Saved on-device
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
