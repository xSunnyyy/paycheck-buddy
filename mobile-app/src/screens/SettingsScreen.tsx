// src/screens/SettingsScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  findNodeHandle,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import {
  usePayflow,
  safeParseNumber,
  type Settings,
  type CreditCard,
  type Allocation,
  type MonthlyItem,
  type PersonalSpendingItem,
} from "@/src/state/usePayflow";

import { Card, COLORS, Divider, Field, TextBtn, TYPE } from "@/src/ui/common";

/* ---------------- helpers ---------------- */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hasValidAnchorDate(iso: string) {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime());
}

function toAnchorISO(d: Date) {
  return d.toISOString();
}

function anchorDateFromISO(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type PayFrequency = "weekly" | "biweekly" | "twice_monthly" | "monthly";

/* ---------------- screen ---------------- */

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    loaded,
    hasCompletedSetup,
    setHasCompletedSetup,
    settings,
    setSettings,
    resetEverything,
  } = usePayflow();

  const mode: "setup" | "normal" = hasCompletedSetup ? "normal" : "setup";

  const scrollRef = useRef<ScrollView>(null);

  const [local, setLocal] = useState<Settings>(settings);
  const [showAnchorPicker, setShowAnchorPicker] = useState(false);
  const [anchorError, setAnchorError] = useState(false);

  // Editable due-day buffers (lets user delete/retype fully)
  const [monthlyDueText, setMonthlyDueText] = useState<Record<string, string>>({});
  const [cardDueText, setCardDueText] = useState<Record<string, string>>({});

  // Calendar picker open card id
  const [openCardPickerId, setOpenCardPickerId] = useState<string | null>(null);

  useEffect(() => {
    setLocal(settings);

    const nextMonthlyMap: Record<string, string> = {};
    for (const m of settings.monthlyItems || []) nextMonthlyMap[m.id] = String(m.dueDay ?? "");
    setMonthlyDueText(nextMonthlyMap);

    const nextCardMap: Record<string, string> = {};
    for (const c of settings.creditCards || []) nextCardMap[c.id] = String(c.dueDay ?? "");
    setCardDueText(nextCardMap);
  }, [settings]);

  const scrollToInput = (inputRef: React.RefObject<TextInput>) => {
    requestAnimationFrame(() => {
      const node = findNodeHandle(inputRef.current);
      const responder: any = scrollRef.current?.getScrollResponder?.();
      if (!node || !responder?.scrollResponderScrollNativeHandleToKeyboard) return;
      responder.scrollResponderScrollNativeHandleToKeyboard(node, 110, true);
    });
  };

  const keepDigitsOnly = (s: string) => s.replace(/[^0-9]/g, "");

  const shouldShowAnchor = local.payFrequency === "weekly" || local.payFrequency === "biweekly";
  const anchorSelected = hasValidAnchorDate(local.anchorISO);

  const freqLabel = (f: PayFrequency) => {
    if (f === "weekly") return "Weekly";
    if (f === "biweekly") return "Bi-weekly";
    if (f === "twice_monthly") return "Twice-monthly";
    return "Monthly";
  };

  function setFreq(f: PayFrequency) {
    setLocal((s) => ({ ...s, payFrequency: f }));
    if (!(f === "weekly" || f === "biweekly")) setAnchorError(false);
  }

  /* ---------------- Distributions ---------------- */

  function addDistribution() {
    const id = `alloc_${Date.now()}`;
    setLocal((s) => ({
      ...s,
      allocations: [...(s.allocations || []), { id, label: "", amount: 0 }],
    }));
  }

  function updateDistribution(id: string, patch: Partial<Allocation>) {
    setLocal((s) => ({
      ...s,
      allocations: (s.allocations || []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }

  function removeDistribution(id: string) {
    setLocal((s) => ({
      ...s,
      allocations: (s.allocations || []).filter((a) => a.id !== id),
    }));
  }

  /* ---------------- Personal Spending ---------------- */

  function addPersonalSpending() {
    const id = `ps_${Date.now()}`;
    setLocal((s) => ({
      ...s,
      personalSpending: [...(s.personalSpending || []), { id, label: "", amount: 0 }],
    }));
  }

  function updatePersonalSpending(id: string, patch: Partial<PersonalSpendingItem>) {
    setLocal((s) => ({
      ...s,
      personalSpending: (s.personalSpending || []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function removePersonalSpending(id: string) {
    setLocal((s) => ({
      ...s,
      personalSpending: (s.personalSpending || []).filter((p) => p.id !== id),
    }));
  }

  /* ---------------- Monthly Items ---------------- */

  function addMonthlyItem() {
    const id = `monthly_${Date.now()}`;
    setLocal((s) => ({
      ...s,
      monthlyItems: [...(s.monthlyItems || []), { id, label: "", amount: 0, dueDay: 1 }],
    }));
    setMonthlyDueText((m) => ({ ...m, [id]: "" }));
  }

  function updateMonthlyItem(id: string, patch: Partial<MonthlyItem>) {
    setLocal((s) => ({
      ...s,
      monthlyItems: (s.monthlyItems || []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }

  function removeMonthlyItem(id: string) {
    setLocal((s) => ({
      ...s,
      monthlyItems: (s.monthlyItems || []).filter((m) => m.id !== id),
    }));
    setMonthlyDueText((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  /* ---------------- Credit Cards ---------------- */

  function updateCard(cardId: string, patch: Partial<CreditCard>) {
    setLocal((s) => ({
      ...s,
      creditCards: (s.creditCards || []).map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
    }));
  }

  function addCard() {
    const id = `cc_${Date.now()}`;
    setLocal((s) => ({
      ...s,
      creditCards: [...(s.creditCards || []), { id, name: "", totalDue: 0, minDue: 0, dueDay: 1 }],
    }));
    setCardDueText((m) => ({ ...m, [id]: "" }));
  }

  function removeCard(id: string) {
    setLocal((s) => ({
      ...s,
      creditCards: (s.creditCards || []).filter((c) => c.id !== id),
    }));
    setCardDueText((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  /* ---------------- Save ---------------- */

  function save() {
    // Anchor required for weekly/biweekly
    if (shouldShowAnchor && !hasValidAnchorDate(local.anchorISO)) {
      setAnchorError(true);
      Alert.alert("Select a payday", "Please choose your payday to finish setup.");
      return;
    }

    // Commit due-day buffers
    const monthlyItems: MonthlyItem[] = (local.monthlyItems || []).map((m) => {
      const t = monthlyDueText[m.id] ?? String(m.dueDay ?? "");
      const n = clamp(Math.floor(safeParseNumber(t)), 1, 31);
      return { ...m, dueDay: n };
    });

    const creditCards: CreditCard[] = (local.creditCards || []).map((c) => {
      const t = cardDueText[c.id] ?? String(c.dueDay ?? "");
      const n = clamp(Math.floor(safeParseNumber(t)), 1, 31);
      return { ...c, dueDay: n };
    });

    const nextLocal: Settings = { ...local, monthlyItems, creditCards };

    // Validate core fields
    if (nextLocal.payAmount < 0) return Alert.alert("Invalid", "Pay amount must be >= 0");
    if (nextLocal.debtRemaining < 0) return Alert.alert("Invalid", "Debt remaining must be >= 0");
    if (nextLocal.twiceMonthlyDay1 < 1 || nextLocal.twiceMonthlyDay1 > 28)
      return Alert.alert("Invalid", "Twice-monthly day #1 must be 1–28");
    if (nextLocal.twiceMonthlyDay2 < 1 || nextLocal.twiceMonthlyDay2 > 28)
      return Alert.alert("Invalid", "Twice-monthly day #2 must be 1–28");
    if (nextLocal.monthlyPayDay < 1 || nextLocal.monthlyPayDay > 28)
      return Alert.alert("Invalid", "Monthly payday must be 1–28");

    setSettings(nextLocal);

    if (mode === "setup") {
      // ✅ set flag first
      setHasCompletedSetup(true);

      // ✅ then redirect immediately (no restart required)
      requestAnimationFrame(() => {
        router.replace("/(tabs)/index");
      });

      Alert.alert("Saved", "Setup complete. You can now use Dashboard + History.");
    } else {
      Alert.alert("Saved", "Settings saved to device.");
    }
  }

  function confirmResetAll() {
    Alert.alert("Reset ALL", "This clears all saved data and returns to setup. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset ALL",
        style: "destructive",
        onPress: async () => {
          await resetEverything();
          Alert.alert("Reset", "All data cleared. Please complete setup again.");
        },
      },
    ]);
  }

  /* ---------------- UI ---------------- */

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
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 280 }}
        >
          <<View style={{ gap: 12 }}>
            {/* Pay schedule */}
            <Card>
              <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>
                {mode === "setup" ? "Pay schedule (setup)" : "Pay schedule"}
              </Text>
              <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                Choose one of the 4 options.
              </Text>

              <Divider />

              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                {(["weekly", "biweekly", "twice_monthly", "monthly"] as PayFrequency[]).map((f) => (
                  <TextBtn
                    key={f}
                    label={freqLabel(f)}
                    onPress={() => setFreq(f)}
                    kind={local.payFrequency === f ? "green" : "default"}
                  />
                ))}
              </View>

              <Field
                label="Pay amount (per pay event)"
                value={String(local.payAmount)}
                onChangeText={(s) => setLocal((p) => ({ ...p, payAmount: safeParseNumber(s) }))}
                keyboardType="numeric"
                placeholder="0"
                onFocusScrollToInput={scrollToInput}
              />

              {shouldShowAnchor ? (
                <>
                  <Text style={{ color: COLORS.muted, ...TYPE.label, marginTop: 10 }}>Payday</Text>

                  <Pressable
                    onPress={() => setShowAnchorPicker(true)}
                    style={{
                      marginTop: 6,
                      borderWidth: 1,
                      borderColor: anchorError && !anchorSelected ? COLORS.redBorder : COLORS.border,
                      borderRadius: 14,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      backgroundColor: "rgba(255,255,255,0.05)",
                    }}
                  >
                    <Text style={{ color: anchorSelected ? COLORS.textStrong : COLORS.faint, fontWeight: "800" }}>
                      {anchorSelected ? formatDate(anchorDateFromISO(local.anchorISO)) : "Select a payday"}
                    </Text>
                    <Text style={{ color: COLORS.faint, marginTop: 4, fontWeight: "700" }}>
                      Tap to pick a date
                    </Text>
                  </Pressable>

                  {showAnchorPicker ? (
                    <DateTimePicker
                      value={anchorSelected ? anchorDateFromISO(local.anchorISO) : new Date()}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS !== "ios") setShowAnchorPicker(false);
                        if (!selectedDate) return;
                        setAnchorError(false);
                        setLocal((p) => ({ ...p, anchorISO: toAnchorISO(selectedDate) }));
                      }}
                    />
                  ) : null}

                  {Platform.OS === "ios" && showAnchorPicker ? (
                    <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                      <TextBtn label="Done" onPress={() => setShowAnchorPicker(false)} kind="green" />
                    </View>
                  ) : null}
                </>
              ) : null}

              {local.payFrequency === "twice_monthly" ? (
                <>
                  <Field
                    label="Twice-monthly payday #1 (1–28)"
                    value={String(local.twiceMonthlyDay1)}
                    onChangeText={(s) =>
                      setLocal((p) => ({ ...p, twiceMonthlyDay1: clamp(safeParseNumber(s), 1, 28) }))
                    }
                    keyboardType="numeric"
                    placeholder="1"
                    onFocusScrollToInput={scrollToInput}
                  />
                  <Field
                    label="Twice-monthly payday #2 (1–28)"
                    value={String(local.twiceMonthlyDay2)}
                    onChangeText={(s) =>
                      setLocal((p) => ({ ...p, twiceMonthlyDay2: clamp(safeParseNumber(s), 1, 28) }))
                    }
                    keyboardType="numeric"
                    placeholder="15"
                    onFocusScrollToInput={scrollToInput}
                  />
                </>
              ) : null}

              {local.payFrequency === "monthly" ? (
                <Field
                  label="Monthly payday (1–28)"
                  value={String(local.monthlyPayDay)}
                  onChangeText={(s) =>
                    setLocal((p) => ({ ...p, monthlyPayDay: clamp(safeParseNumber(s), 1, 28) }))
                  }
                  keyboardType="numeric"
                  placeholder="1"
                  onFocusScrollToInput={scrollToInput}
                />
              ) : null}
            </Card>

            {/* Totals */}
            <Card>
              <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Totals</Text>
              <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                One total debt, auto-decreases when you check Debt Paydown.
              </Text>

              <Divider />

              <Field
                label="Debt remaining"
                value={String(local.debtRemaining)}
                onChangeText={(s) => setLocal((p) => ({ ...p, debtRemaining: safeParseNumber(s) }))}
                keyboardType="numeric"
                placeholder="0"
                onFocusScrollToInput={scrollToInput}
              />
            </Card>

            {/* Paycheck Distributions */}
            <Card>
              <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Paycheck Distributions</Text>
              <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                Items that repeat every pay cycle (e.g., Savings, Investing).
              </Text>

              <Divider />

              <View style={{ gap: 12 }}>
                {(local.allocations || []).map((a) => (
                  <View
                    key={a.id}
                    style={{
                      borderWidth: 1,
                      borderColor: COLORS.borderSoft,
                      borderRadius: 16,
                      padding: 12,
                      backgroundColor: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Paycheck Distribution</Text>

                    <Field
                      label="Name"
                      value={a.label}
                      onChangeText={(s) => updateDistribution(a.id, { label: s })}
                      placeholder="Savings"
                      onFocusScrollToInput={scrollToInput}
                      clearOnFocus
                    />
                    <Field
                      label="Amount"
                      value={String(a.amount)}
                      onChangeText={(s) => updateDistribution(a.id, { amount: safeParseNumber(s) })}
                      keyboardType="numeric"
                      placeholder="0"
                      onFocusScrollToInput={scrollToInput}
                      clearOnFocus
                    />

                    <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                      <TextBtn label="Remove distribution" onPress={() => removeDistribution(a.id)} kind="red" />
                    </View>
                  </View>
                ))}

                <TextBtn label="Add distribution" onPress={addDistribution} />
              </View>
            </Card>

            {/* Personal Spending */}
            <Card>
              <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Personal Spending</Text>
              <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                Personal “fun money” items that repeat every pay cycle.
              </Text>

              <Divider />

              <View style={{ gap: 12 }}>
                {(local.personalSpending || []).map((p) => (
                  <View
                    key={p.id}
                    style={{
                      borderWidth: 1,
                      borderColor: COLORS.borderSoft,
                      borderRadius: 16,
                      padding: 12,
                      backgroundColor: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Personal Spending Item</Text>

                    <Field
                      label="Name"
                      value={p.label}
                      onChangeText={(s) => updatePersonalSpending(p.id, { label: s })}
                      placeholder="Dining out"
                      onFocusScrollToInput={scrollToInput}
                      clearOnFocus
                    />
                    <Field
                      label="Amount"
                      value={String(p.amount)}
                      onChangeText={(s) => updatePersonalSpending(p.id, { amount: safeParseNumber(s) })}
                      keyboardType="numeric"
                      placeholder="0"
                      onFocusScrollToInput={scrollToInput}
                      clearOnFocus
                    />

                    <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                      <TextBtn label="Remove personal item" onPress={() => removePersonalSpending(p.id)} kind="red" />
                    </View>
                  </View>
                ))}

                <TextBtn label="Add personal spending" onPress={addPersonalSpending} />
              </View>
            </Card>

            {/* Monthly Expenses */}
            <Card>
              <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Monthly Expenses</Text>
              <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                Monthly items you want planned each month (e.g., Electricity, Internet, etc.).
              </Text>

              <Divider />

              <View style={{ gap: 12 }}>
                {(local.monthlyItems || []).map((m) => (
                  <View
                    key={m.id}
                    style={{
                      borderWidth: 1,
                      borderColor: COLORS.borderSoft,
                      borderRadius: 16,
                      padding: 12,
                      backgroundColor: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Monthly Expense</Text>

                    <Field
                      label="Name"
                      value={m.label}
                      onChangeText={(s) => updateMonthlyItem(m.id, { label: s })}
                      placeholder="Electricity"
                      onFocusScrollToInput={scrollToInput}
                      clearOnFocus
                    />

                    <Field
                      label="Amount"
                      value={String(m.amount)}
                      onChangeText={(s) => updateMonthlyItem(m.id, { amount: safeParseNumber(s) })}
                      keyboardType="numeric"
                      placeholder="0"
                      onFocusScrollToInput={scrollToInput}
                      clearOnFocus
                    />

                    <Field
                      label="Due day (1–31)"
                      value={monthlyDueText[m.id] ?? ""}
                      onChangeText={(s) => setMonthlyDueText((map) => ({ ...map, [m.id]: keepDigitsOnly(s) }))}
                      keyboardType="numeric"
                      placeholder="1"
                      onFocusScrollToInput={scrollToInput}
                      clearOnFocus
                    />

                    <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                      <TextBtn label="Remove monthly expense" onPress={() => removeMonthlyItem(m.id)} kind="red" />
                    </View>
                  </View>
                ))}

                <TextBtn label="Add monthly expense" onPress={addMonthlyItem} />
              </View>
            </Card>

            {/* Credit Cards */}
            <Card>
              <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Credit Cards</Text>
              <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                Add each card’s due date + minimum payment. The app assigns it to the correct paycheck (1–15 vs 16–31).
              </Text>

              <Divider />

              <View style={{ gap: 12 }}>
                {(local.creditCards || []).map((c) => {
                  const dueText = cardDueText[c.id] ?? "";
                  const dueDay = dueText ? clamp(safeParseNumber(dueText), 1, 31) : c.dueDay;

                  return (
                    <View
                      key={c.id}
                      style={{
                        borderWidth: 1,
                        borderColor: COLORS.borderSoft,
                        borderRadius: 16,
                        padding: 12,
                        backgroundColor: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Credit Card</Text>

                      <Field
                        label="Name"
                        value={c.name}
                        onChangeText={(s) => updateCard(c.id, { name: s })}
                        placeholder="Chase Freedom"
                        onFocusScrollToInput={scrollToInput}
                        clearOnFocus
                      />

                      <Field
                        label="Total Amount Due"
                        value={String(c.totalDue)}
                        onChangeText={(s) => updateCard(c.id, { totalDue: safeParseNumber(s) })}
                        keyboardType="numeric"
                        placeholder="0"
                        onFocusScrollToInput={scrollToInput}
                        clearOnFocus
                      />

                      <Field
                        label="Minimum Due"
                        value={String(c.minDue)}
                        onChangeText={(s) => updateCard(c.id, { minDue: safeParseNumber(s) })}
                        keyboardType="numeric"
                        placeholder="0"
                        onFocusScrollToInput={scrollToInput}
                        clearOnFocus
                      />

                      <Text style={{ color: COLORS.muted, ...TYPE.label, marginTop: 10 }}>Due Date</Text>

                      <Pressable
                        onPress={() => setOpenCardPickerId(c.id)}
                        style={{
                          marginTop: 6,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          borderRadius: 14,
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          backgroundColor: "rgba(255,255,255,0.05)",
                        }}
                      >
                        <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Day {dueDay} of the month</Text>
                        <Text style={{ color: COLORS.faint, marginTop: 4, fontWeight: "700" }}>
                          Tap to pick a date (we only store the day number)
                        </Text>
                      </Pressable>

                      {openCardPickerId === c.id ? (
                        <DateTimePicker
                          value={new Date()}
                          mode="date"
                          display={Platform.OS === "ios" ? "spinner" : "default"}
                          onChange={(event, selectedDate) => {
                            if (Platform.OS !== "ios") setOpenCardPickerId(null);
                            if (!selectedDate) return;
                            const day = selectedDate.getDate();
                            setCardDueText((map) => ({ ...map, [c.id]: String(day) }));
                            updateCard(c.id, { dueDay: day });
                          }}
                        />
                      ) : null}

                      {Platform.OS === "ios" && openCardPickerId === c.id ? (
                        <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                          <TextBtn label="Done" onPress={() => setOpenCardPickerId(null)} kind="green" />
                        </View>
                      ) : null}

                      <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                        <TextBtn label="Remove card" onPress={() => removeCard(c.id)} kind="red" />
                      </View>
                    </View>
                  );
                })}

                <TextBtn label="Add credit card" onPress={addCard} />
              </View>
            </Card>

            {/* Actions */}
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <TextBtn label={mode === "setup" ? "Finish setup" : "Save settings"} onPress={save} kind="green" />
            </View>

            <View style={{ marginTop: 12 }}>
              <TextBtn label="Reset ALL (start over)" onPress={confirmResetAll} kind="red" />
            </View>

            <Text style={{ color: COLORS.faint, marginTop: 10, textAlign: "center", fontWeight: "700" }}>
              Offline • Saved on-device
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
