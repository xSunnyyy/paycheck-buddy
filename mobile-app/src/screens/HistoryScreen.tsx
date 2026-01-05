// src/screens/HistoryScreen.tsx
import React, { useState, useMemo } from "react";
import { ScrollView, StatusBar, Text, View, Pressable, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { usePayflow } from "@/src/state/PayFlowProvider";
import {
  fmtMoney,
  formatDate,
  type CardPayment,
  type Cycle,
} from "@/src/state/usePayflow";

import { Card, Chip, COLORS, Divider, TextBtn, TYPE } from "@/src/ui/common";

// --- Sub-Components ---

// 1. Single Payment Row (Memoized)
const PaymentRow = React.memo(function PaymentRow({
  payment,
  cardName,
  onDelete,
}: {
  payment: CardPayment;
  cardName: string;
  onDelete: () => void;
}) {
  return (
    <View style={styles.paymentBox}>
      <View style={[styles.row, { gap: 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.textStrong}>{cardName}</Text>
          <Text style={styles.subText}>
            {fmtMoney(payment.amount)} • {new Date(payment.atISO).toLocaleString()}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <Chip>{fmtMoney(payment.amount)}</Chip>
          <TextBtn label="Delete" kind="red" onPress={onDelete} />
        </View>
      </View>
    </View>
  );
});

// 2. Cycle Card (Memoized)
// Handles the summary and the expanded details
const CycleCard = React.memo(function CycleCard({
  cycle,
  isOpen,
  onToggle,
  stats,
  payments,
  settings,
  onRemovePayment,
}: {
  cycle: Cycle;
  isOpen: boolean;
  onToggle: () => void;
  stats: { checked: number; ux: number; pay: number };
  payments: CardPayment[];
  settings: any;
  onRemovePayment: (cycleId: string, paymentId: string) => void;
}) {
  return (
    <Card>
      <Pressable onPress={onToggle}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.textStrong}>{formatDate(cycle.payday)}</Text>
            <Text style={styles.subText}>{cycle.label}</Text>
          </View>

          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <Chip>{stats.checked} checked</Chip>
            <Chip>UX {fmtMoney(stats.ux)}</Chip>
            <Chip>CC {fmtMoney(stats.pay)}</Chip>
          </View>
        </View>
      </Pressable>

      {isOpen && (
        <>
          <Divider />
          <Text style={styles.textStrong}>Manual credit-card payments</Text>
          
          {payments.length === 0 ? (
            <Text style={[styles.mutedText, { marginTop: 6 }]}>
              None recorded.
            </Text>
          ) : (
            <View style={{ marginTop: 10, gap: 10 }}>
              {payments.map((p) => {
                const card = (settings.creditCards || []).find((x: any) => x.id === p.cardId);
                return (
                  <PaymentRow
                    key={p.id}
                    payment={p}
                    cardName={card?.name || "Credit Card"}
                    onDelete={() => onRemovePayment(cycle.id, p.id)}
                  />
                );
              })}
            </View>
          )}

          <Divider />
          <Text style={styles.mutedText}>
            Deleting a payment restores the amount back to the card balance.
          </Text>
        </>
      )}
    </Card>
  );
});

// --- Main Screen ---

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [openId, setOpenId] = useState<string | null>(null);

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

  // Loading State
  if (!loaded) {
    return (
      <SafeAreaView style={styles.fullScreen} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <Text style={styles.textStrong}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Setup Required State
  if (!hasCompletedSetup) {
    return (
      <SafeAreaView style={styles.fullScreen} edges={["top", "left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={styles.container}>
          <Card>
            <Text style={styles.h1}>History</Text>
            <Text style={[styles.mutedText, { marginTop: 6 }]}>
              Finish setup in Settings to start tracking cycles.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.fullScreen} edges={["top", "left", "right"]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <View style={[styles.container, { paddingBottom: 14 + insets.bottom }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 220 }}
        >
          <Card>
            <Text style={styles.h2}>Last 10 cycles</Text>
            <Text style={[styles.mutedText, { marginTop: 6 }]}>
              Review what you completed, unexpected expenses, and manual credit-card payments.
            </Text>
          </Card>

          <View style={{ marginTop: 12, gap: 12 }}>
            {last10Cycles.map((c) => {
              // Calculate stats for this cycle
              const checkedObj = getCycleChecked(c.id);
              const checkedCount = Object.values(checkedObj).filter((x) => x?.checked).length;
              const uxTotal = getCycleUnexpectedTotal(c.id);
              const pays = getCycleCardPayments(c.id);
              const payTotal = pays.reduce((sum, p) => sum + (p.amount || 0), 0);

              const stats = { checked: checkedCount, ux: uxTotal, pay: payTotal };

              return (
                <CycleCard
                  key={c.id}
                  cycle={c}
                  isOpen={openId === c.id}
                  onToggle={() => setOpenId((cur) => (cur === c.id ? null : c.id))}
                  stats={stats}
                  payments={pays}
                  settings={settings}
                  onRemovePayment={removeCardPayment}
                />
              );
            })}
          </View>

          <Text style={styles.footerText}>
            Offline • Saved on-device
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: COLORS.bg,
  },
  
  // Text Styles
  textStrong: {
    color: COLORS.textStrong,
    fontWeight: "900",
  },
  mutedText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  subText: {
    color: COLORS.muted,
    marginTop: 4,
    fontWeight: "700",
  },
  h1: {
    color: COLORS.textStrong,
    ...TYPE.h1,
  },
  h2: {
    color: COLORS.textStrong,
    ...TYPE.h2,
  },
  footerText: {
    color: COLORS.faint,
    marginTop: 14,
    textAlign: "center",
    fontWeight: "700",
  },

  // Components
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentBox: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
});