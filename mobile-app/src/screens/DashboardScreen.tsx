// src/screens/DashboardScreen.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  Pressable,
  Modal,
  findNodeHandle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardHeight } from "@/src/hooks/useKeyboardHeight";

import {
  usePayflow,
  fmtMoney,
  formatDate,
  displayCategory,
  CreditCard,
} from "@/src/state/usePayflow";

import { Card, Chip, COLORS, Divider, Field, TextBtn, TYPE } from "@/src/ui/common";

function ListRow({
  title,
  subtitle,
  amount,
  checked,
  onPress,
}: {
  title: string;
  subtitle?: string;
  amount: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.09)",
        backgroundColor: checked ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.03)",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: checked ? "rgba(34,197,94,0.70)" : "rgba(255,255,255,0.20)",
            backgroundColor: checked ? "rgba(34,197,94,0.20)" : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: COLORS.textStrong, fontWeight: "900", fontSize: 12 }}>
            {checked ? "✓" : ""}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>{title}</Text>
          {subtitle ? (
            <Text style={{ color: COLORS.muted, marginTop: 3, fontWeight: "700", fontSize: 12 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>{amount}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function BottomSheet({
  visible,
  onClose,
  title,
  children,
  bottomInset = 0,
  keyboardHeight = 0,
  keyboardOffset = 0,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  bottomInset?: number;
  keyboardHeight?: number;
  keyboardOffset?: number;
}) {
  const extraBottom = Math.max(0, keyboardHeight - keyboardOffset);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={keyboardOffset}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
      >
        <View
          style={{
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.bg,
            maxHeight: "88%",
            paddingBottom: 12 + bottomInset + extraBottom,
          }}
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <View
              style={{
                alignSelf: "center",
                width: 44,
                height: 5,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.18)",
                marginBottom: 10,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>{title}</Text>
              <TextBtn label="Close" onPress={onClose} />
            </View>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ marginTop: 10 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  const {
    loaded,
    hasCompletedSetup,
    setHasCompletedSetup,

    settings,
    cycleOffset,
    setCycleOffset,
    viewCycle,
    grouped,
    totals,

    // checklist (non-card)
    activeChecked,
    toggleItem,

    // unexpected
    unexpected,
    unexpectedTotal,
    addUnexpected,
    removeUnexpected,

    personalSpendingTotal,

    // ✅ NEW: credit card + payments
    activeCreditCards,
    cardPaymentsTotalThisCycle,
    getCardPaidThisCycle,
    isMinimumPaidThisCycle,
    toggleMinimumPaidForCard,
    addManualCardPayment,
  } = usePayflow();

  const keyboardOffset = Math.max(0, insets.top + 24);

  const scrollRef = useRef<ScrollView>(null);
  const scrollToInput = (inputRef: React.RefObject<TextInput>) => {
    requestAnimationFrame(() => {
      const node = findNodeHandle(inputRef.current);
      const responder: any = scrollRef.current?.getScrollResponder?.();
      if (!node || !responder?.scrollResponderScrollNativeHandleToKeyboard) return;
      responder.scrollResponderScrollNativeHandleToKeyboard(node, 110, true);
    });
  };

  // Unexpected sheet state
  const [uxSheetOpen, setUxSheetOpen] = useState(false);
  const [uxLabel, setUxLabel] = useState("");
  const [uxAmount, setUxAmount] = useState("");

  // ✅ Card payment sheet state
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [pickCardOpen, setPickCardOpen] = useState(false);
  const [payCardId, setPayCardId] = useState<string>("");
  const [payAmount, setPayAmount] = useState("");

  const payAmountRef = useRef<TextInput>(null);

  const selectedCard: CreditCard | undefined = useMemo(() => {
    if (!payCardId) return undefined;
    return (settings.creditCards || []).find((c) => c.id === payCardId);
  }, [settings.creditCards, payCardId]);

  const ensureDefaultPayCard = () => {
    if (payCardId) return;
    const first = (activeCreditCards || [])[0];
    if (first) setPayCardId(first.id);
  };

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

  // If setup gate is still required, route user to Settings tab to finish setup.
  if (!hasCompletedSetup) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={{ flex: 1, padding: 16, paddingTop: 10 }}>
          <Card>
            <Text style={{ color: COLORS.textStrong, ...TYPE.h1 }}>Welcome</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
              Go to <Text style={{ color: COLORS.textStrong }}>Settings</Text> to complete setup.
            </Text>

            <Divider />

            {/* keep this only if you want a temporary bypass while developing */}
            <TextBtn
              label="Mark setup complete (dev)"
              kind="green"
              onPress={() => setHasCompletedSetup(true)}
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={keyboardOffset}
      >
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
            style={{ marginTop: 0 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingTop: 2,
              paddingBottom: 260 + keyboardHeight,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Cycle header */}
            <Card>
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <TextBtn label="◀︎" onPress={() => setCycleOffset((o) => o - 1)} />
                  <View style={{ alignItems: "center", flex: 1 }}>
                    <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>
                      {cycleOffset === 0
                        ? "This paycheck"
                        : cycleOffset > 0
                        ? `Next +${cycleOffset}`
                        : `Prev ${cycleOffset}`}
                    </Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700", textAlign: "center" }}>
                      Payday {formatDate(viewCycle.payday)}
                    </Text>
                  </View>
                  <TextBtn label="▶︎" onPress={() => setCycleOffset((o) => o + 1)} />
                </View>

                {cycleOffset !== 0 ? (
                  <View style={{ marginTop: 10, alignItems: "center" }}>
                    <TextBtn label="Back to current" onPress={() => setCycleOffset(0)} kind="green" />
                  </View>
                ) : null}
              </View>
            </Card>

            {/* Summary */}
            <View style={{ marginTop: 12 }}>
              <Card>
                <View style={{ gap: 10 }}>
                  <Row label="Pay amount" value={fmtMoney(settings.payAmount)} />
                  <Row label="Personal spending (per pay)" value={fmtMoney(personalSpendingTotal)} />
                  <Row label="Debt remaining" value={fmtMoney(settings.debtRemaining)} />
                  <Row label="Card payments (this cycle)" value={fmtMoney(cardPaymentsTotalThisCycle)} />
                  <Row label="Unexpected (this cycle)" value={fmtMoney(unexpectedTotal)} />
                  <Row label="Planned (checklist)" value={fmtMoney(totals.planned)} />

                  <Text style={{ color: COLORS.muted, ...TYPE.body }}>
                    Progress:{" "}
                    <Text style={{ color: COLORS.textStrong }}>
                      {totals.itemsDone}/{totals.itemsTotal} ({totals.pct}%)
                    </Text>
                  </Text>
                </View>
              </Card>
            </View>

            {/* Checklist */}
            <View style={{ marginTop: 12, gap: 12 }}>
              {grouped.map(([cat, catItems]) => {
                const plannedForCat = catItems.reduce((sum, i) => sum + (i.amount || 0), 0);
                const label = displayCategory(cat as any);

                // ✅ CUSTOM CREDIT CARD RENDER
                if (cat === "Credit Cards") {
                  return (
                    <Card key={String(cat)}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Credit Cards</Text>
                        <Chip>{fmtMoney(plannedForCat)} min due</Chip>
                      </View>

                      <Divider />

                      {activeCreditCards.length === 0 ? (
                        <>
                          <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                            No active cards. Paid-off cards are hidden from the dashboard.
                          </Text>

                          <Divider />

                          <TextBtn
                            label="Add a payment"
                            onPress={() => {
                              // no active cards, so nothing to pay
                            }}
                            disabled
                          />
                        </>
                      ) : (
                        <>
                          {/* Card list */}
                          <View style={{ gap: 10 }}>
                            {activeCreditCards.map((c) => {
                              const minPaid = isMinimumPaidThisCycle(c.id);
                              const paidThisCycle = getCardPaidThisCycle(c.id);
                              const subtitle = [
                                `Balance ${fmtMoney(c.balance || 0)}`,
                                `Min ${fmtMoney(c.minDue || 0)}`,
                                `Due day ${c.dueDay || 1}`,
                                (c.totalDue || 0) > 0 ? `Total due ${fmtMoney(c.totalDue || 0)}` : "",
                                paidThisCycle > 0 ? `Paid this cycle ${fmtMoney(paidThisCycle)}` : "",
                              ]
                                .filter(Boolean)
                                .join(" • ");

                              return (
                                <ListRow
                                  key={c.id}
                                  title={`${c.name || "Credit Card"} (minimum)`}
                                  subtitle={subtitle}
                                  amount={fmtMoney(c.minDue || 0)}
                                  checked={minPaid}
                                  onPress={() => toggleMinimumPaidForCard(c.id)}
                                />
                              );
                            })}
                          </View>

                          <Divider />

                          {/* Add Payment */}
                          <View style={{ gap: 10 }}>
                            <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                              Add a payment (manual)
                            </Text>
                            <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                              Choose a card + enter the amount you paid. This reduces the card balance and counts against this paycheck.
                            </Text>

                            <TextBtn
                              label="Add a payment"
                              kind="green"
                              onPress={() => {
                                ensureDefaultPayCard();
                                setPaySheetOpen(true);
                                Keyboard.dismiss();
                              }}
                            />
                          </View>
                        </>
                      )}
                    </Card>
                  );
                }

                // Default render for non-card categories
                return (
                  <Card key={String(cat)}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>{label}</Text>
                      <Chip>{fmtMoney(plannedForCat)} planned</Chip>
                    </View>

                    <Divider />

                    <View style={{ gap: 10 }}>
                      {catItems.map((it) => {
                        const state = activeChecked[it.id];
                        const isChecked = !!state?.checked;

                        const subtitleParts: string[] = [];
                        if (it.notes) subtitleParts.push(it.notes);
                        if (isChecked && state?.at)
                          subtitleParts.push(`checked ${new Date(state.at).toLocaleString()}`);

                        const subtitle = subtitleParts.filter(Boolean).join(" • ");

                        return (
                          <ListRow
                            key={it.id}
                            title={it.label}
                            subtitle={subtitle || undefined}
                            amount={fmtMoney(it.amount)}
                            checked={isChecked}
                            onPress={() => toggleItem(it.id)}
                          />
                        );
                      })}
                    </View>
                  </Card>
                );
              })}
            </View>

            {/* Unexpected */}
            <View style={{ marginTop: 12 }}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Unexpected (this cycle)</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                      Total: <Text style={{ color: COLORS.textStrong }}>{fmtMoney(unexpectedTotal)}</Text>
                    </Text>
                  </View>
                  <TextBtn label="Add" kind="green" onPress={() => setUxSheetOpen(true)} />
                </View>

                {unexpected.length > 0 ? (
                  <>
                    <Divider />
                    <View style={{ gap: 10 }}>
                      {unexpected.map((x) => (
                        <View
                          key={x.id}
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
                              <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>{x.label}</Text>
                              <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                                {fmtMoney(x.amount)} • {new Date(x.atISO).toLocaleString()}
                              </Text>
                            </View>
                            <View style={{ alignItems: "flex-end", gap: 8 }}>
                              <Chip>{fmtMoney(x.amount)}</Chip>
                              <TextBtn
                                label="Remove"
                                kind="red"
                                onPress={() => removeUnexpected(viewCycle.id, x.id)}
                              />
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <Divider />
                    <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                      None yet. Tap “Add” to record one.
                    </Text>
                  </>
                )}
              </Card>
            </View>

            <Text style={{ color: COLORS.faint, marginTop: 14, textAlign: "center", fontWeight: "700" }}>
              Offline • Saved on-device
            </Text>
          </ScrollView>

          {/* ✅ Add payment bottom sheet */}
          <BottomSheet
            visible={paySheetOpen}
            onClose={() => {
              setPaySheetOpen(false);
              Keyboard.dismiss();
            }}
            title="Add credit card payment"
            bottomInset={insets.bottom}
            keyboardHeight={keyboardHeight}
            keyboardOffset={keyboardOffset}
          >
            <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
              Select a card and enter what you paid. This will reduce your card balance immediately.
            </Text>

            <Pressable
              onPress={() => setPickCardOpen(true)}
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.09)",
                backgroundColor: "rgba(255,255,255,0.03)",
              }}
            >
              <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12 }}>Card</Text>
              <Text style={{ color: COLORS.textStrong, fontWeight: "900", marginTop: 6 }}>
                {selectedCard?.name || (activeCreditCards[0]?.name ?? "Select a card")}
              </Text>
              {selectedCard ? (
                <Text style={{ color: COLORS.muted, fontWeight: "700", marginTop: 6 }}>
                  Balance {fmtMoney(selectedCard.balance || 0)} • Min {fmtMoney(selectedCard.minDue || 0)} • Due day{" "}
                  {selectedCard.dueDay || 1}
                </Text>
              ) : null}
            </Pressable>

            <Field
              label="Amount"
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="numeric"
              placeholder="0"
              onFocusScrollToInput={scrollToInput}
              clearOnFocus
            />

            <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <TextBtn
                label="Add payment"
                kind="green"
                disabled={!payCardId || Number(payAmount) <= 0}
                onPress={() => {
                  const cardId = payCardId || activeCreditCards[0]?.id;
                  if (!cardId) return;

                  const ok = addManualCardPayment(cardId, payAmount);
                  if (!ok) return;

                  setPayAmount("");
                  Keyboard.dismiss();
                  setPaySheetOpen(false);
                }}
              />
              <TextBtn label="Cancel" onPress={() => setPaySheetOpen(false)} />
            </View>
          </BottomSheet>

          {/* ✅ Card picker sheet (dropdown) */}
          <BottomSheet
            visible={pickCardOpen}
            onClose={() => setPickCardOpen(false)}
            title="Select card"
            bottomInset={insets.bottom}
            keyboardHeight={keyboardHeight}
            keyboardOffset={keyboardOffset}
          >
            <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
              Only active (balance &gt; 0) cards are shown.
            </Text>

            <Divider />

            <View style={{ gap: 10 }}>
              {activeCreditCards.map((c) => {
                const selected = c.id === (payCardId || activeCreditCards[0]?.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setPayCardId(c.id);
                      setPickCardOpen(false);
                      // focus amount after selecting
                      requestAnimationFrame(() => {
                        payAmountRef.current?.focus?.();
                      });
                    }}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: selected ? "rgba(34,197,94,0.55)" : "rgba(255,255,255,0.09)",
                      backgroundColor: selected ? "rgba(34,197,94,0.10)" : "rgba(255,255,255,0.03)",
                    }}
                  >
                    <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>{c.name || "Credit Card"}</Text>
                    <Text style={{ color: COLORS.muted, fontWeight: "700", marginTop: 4 }}>
                      Balance {fmtMoney(c.balance || 0)} • Min {fmtMoney(c.minDue || 0)} • Due day {c.dueDay || 1}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </BottomSheet>

          {/* Add unexpected bottom sheet */}
          <BottomSheet
            visible={uxSheetOpen}
            onClose={() => {
              setUxSheetOpen(false);
              Keyboard.dismiss();
            }}
            title="Add unexpected expense"
            bottomInset={insets.bottom}
            keyboardHeight={keyboardHeight}
            keyboardOffset={keyboardOffset}
          >
            <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
              Add a one-off cost for this pay cycle. It reduces what you can pay toward debt automatically.
            </Text>

            <Field
              label="Label"
              value={uxLabel}
              onChangeText={setUxLabel}
              placeholder="Car repair"
              onFocusScrollToInput={scrollToInput}
              clearOnFocus
            />
            <Field
              label="Amount"
              value={uxAmount}
              onChangeText={setUxAmount}
              keyboardType="numeric"
              placeholder="0"
              onFocusScrollToInput={scrollToInput}
              clearOnFocus
            />

            <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <TextBtn
                label="Add"
                kind="green"
                disabled={Number(uxAmount) <= 0}
                onPress={() => {
                  const ok = addUnexpected(uxLabel, uxAmount);
                  if (!ok) return;
                  setUxLabel("");
                  setUxAmount("");
                  Keyboard.dismiss();
                  setUxSheetOpen(false);
                }}
              />
              <TextBtn label="Cancel" onPress={() => setUxSheetOpen(false)} />
            </View>
          </BottomSheet>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
