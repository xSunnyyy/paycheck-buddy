// src/screens/HistoryScreen.tsx
import React, { useState } from "react";
import { ScrollView, StatusBar, Text, View, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  usePayflow,
  fmtMoney,
  formatDate,
  type CardPayment,
} from "@/src/state/usePayflow";

import { Card, Chip, COLORS, Divider, TextBtn, TYPE } from "@/src/ui/common";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();

  const {
    loaded,
    hasCompletedSetup,
    last10Cycles,
    getCycleChecked,
    getCycleUnexpectedTotal,
    getCycleCardPayments,
    removeCardPayment,
    settings,
  } = usePayflow();

  const [openId, setOpenId] = useState<string | null>(null);

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
        <View style={{ flex: 1, padding: 16, paddingTop: 10 }}>
          <Card>
            <Text style={{ color: COLORS.textStrong, ...TYPE.h1 }}>History</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
              Finish setup in Settings to start tracking cycles.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 14 + insets.bottom,
          backgroundColor: COLORS.bg,
        }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 220 }}
        >
          <Card>
            <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Last 10 cycles</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
              Review what you completed, unexpected expenses, and manual credit-card payments.
            </Text>
          </Card>

          <View style={{ marginTop: 12, gap: 12 }}>
            {last10Cycles.map((c) => {
              const checked = getCycleChecked(c.id);
              const checkedCount = Object.values(checked).filter((x) => x?.checked).length;

              const uxTotal = getCycleUnexpectedTotal(c.id);
              const pays: CardPayment[] = getCycleCardPayments(c.id);
              const payTotal = pays.reduce((sum, p) => sum + (p.amount || 0), 0);

              const open = openId === c.id;

              return (
                <Card key={c.id}>
                  <Pressable onPress={() => setOpenId((cur) => (cur === c.id ? null : c.id))}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>
                          {formatDate(c.payday)}
                        </Text>
                        <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                          {c.label}
                        </Text>
                      </View>

                      <View style={{ alignItems: "flex-end", gap: 8 }}>
                        <Chip>{checkedCount} checked</Chip>
                        <Chip>UX {fmtMoney(uxTotal)}</Chip>
                        <Chip>CC {fmtMoney(payTotal)}</Chip>
                      </View>
                    </View>
                  </Pressable>

                  {open ? (
                    <>
                      <Divider />

                      <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Manual credit-card payments</Text>
                      {pays.length === 0 ? (
                        <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                          None recorded.
                        </Text>
                      ) : (
                        <View style={{ marginTop: 10, gap: 10 }}>
                          {pays.map((p) => {
                            const card = (settings.creditCards || []).find((x) => x.id === p.cardId);
                            return (
                              <View
                                key={p.id}
                                style={{
                                  padding: 12,
                                  borderRadius: 16,
                                  borderWidth: 1,
                                  borderColor: "rgba(255,255,255,0.09)",
                                  backgroundColor: "rgba(255,255,255,0.03)",
                                }}
                              >
                                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>
                                      {card?.name || "Credit Card"}
                                    </Text>
                                    <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                                      {fmtMoney(p.amount)} • {new Date(p.atISO).toLocaleString()}
                                    </Text>
                                  </View>
                                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                                    <Chip>{fmtMoney(p.amount)}</Chip>
                                    <TextBtn
                                      label="Delete"
                                      kind="red"
                                      onPress={() => removeCardPayment(c.id, p.id)}
                                    />
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      <Divider />
                      <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                        Deleting a payment restores the amount back to the card balance.
                      </Text>
                    </>
                  ) : null}
                </Card>
              );
            })}
          </View>

          <Text style={{ color: COLORS.faint, marginTop: 14, textAlign: "center", fontWeight: "700" }}>
            Offline • Saved on-device
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
