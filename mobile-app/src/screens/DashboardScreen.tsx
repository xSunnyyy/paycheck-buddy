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
  type CreditCard,
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
    activeChecked,
    totals,

    toggleItem,

    unexpected,
    unexpectedTotal,
    addUnexpected,
    removeUnexpected,

    personalSpendingTotal,

    // manual payments
    payments,
    manualPaymentsTotal,
    addCardPayment,
    removeCardPayment,
  } = usePayflow();

  const keyboardOffset = Math.max(0, insets.top + 24);

  const scrollRef = useRef<ScrollView>(null);
  const scrollToInput = (inputRef: React.RefObject<TextInput>) => {
    setTimeout(() => {
      const node = findNodeHandle(inputRef.current);
      const responder: any = scrollRef.current?.getScrollResponder?.();
      if (!node || !responder?.scrollResponderScrollNativeHandleToKeyboard) return;
      responder.scrollResponderScrollNativeHandleToKeyboard(node, 130, true);
    }, 40);
  };

  // bottom sheet for unexpected
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uxLabel, setUxLabel] = useState("");
  const [uxAmount, setUxAmount] = useState("");
  const [uxCardId, setUxCardId] = useState<string>(""); // "" = Cash/Debit, else cardId

  // manual payment UI
  const [payCardId, setPayCardId] = useState<string>("");
  const [payAmount, setPayAmount] = useState("");

  // collapsed by default (payments)
  const [paymentsCollapsed, setPaymentsCollapsed] = useState(true);

  // ✅ NEW: collapsed by default (summary)
  const [summaryCollapsed, setSummaryCollapsed] = useState(true);

  const payableCards: CreditCard[] = useMemo(
    () => (settings.creditCards || []).filter((c) => (c.balance || 0) > 0),
    [settings.creditCards]
  );

  // total credit card debt for Summary
  const creditCardDebtTotal = useMemo(
    () => (settings.creditCards || []).reduce((sum, c) => sum + (c.balance || 0), 0),
    [settings.creditCards]
  );

  // default selected card for payments
  React.useEffect(() => {
    if (!payCardId && payableCards.length > 0) setPayCardId(payableCards[0].id);
  }, [payCardId, payableCards]);

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
            <Text style={{ color: COLORS.textStrong, ...TYPE.h1 }}>Welcome</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
              Go to <Text style={{ color: COLORS.textStrong }}>Settings</Text> to complete setup.
            </Text>

            <Divider />

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

            {/* ✅ Summary (collapsible) */}
            <View style={{ marginTop: 12 }}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Summary</Text>
                  <TextBtn
                    label={summaryCollapsed ? "Show" : "Hide"}
                    onPress={() => setSummaryCollapsed((v) => !v)}
                  />
                </View>

                <Divider />

                {/* Always visible */}
                <Text style={{ color: COLORS.muted, ...TYPE.body }}>
                  Progress:{" "}
                  <Text style={{ color: COLORS.textStrong }}>
                    {totals.itemsDone}/{totals.itemsTotal} ({totals.pct}%)
                  </Text>
                </Text>

                {/* Expanded content */}
                {summaryCollapsed ? null : (
                  <>
                    <Divider />
                    <View style={{ gap: 10 }}>
                      <Row label="Pay amount" value={fmtMoney(settings.payAmount)} />
                      <Row label="Credit Card Debt" value={fmtMoney(creditCardDebtTotal)} />
                      <Row label="Personal spending (per pay)" value={fmtMoney(personalSpendingTotal)} />
                      <Row label="Debt remaining (other)" value={fmtMoney(settings.debtRemaining)} />
                      <Row label="Manual card payments (this cycle)" value={fmtMoney(manualPaymentsTotal)} />
                      <Row label="Unexpected (this cycle)" value={fmtMoney(unexpectedTotal)} />
                      <Row label="Planned" value={fmtMoney(totals.planned)} />
                      <Row label="Completed" value={fmtMoney(totals.done)} />
                    </View>
                  </>
                )}
              </Card>
            </View>

            {/* Checklist */}
            <View style={{ marginTop: 12, gap: 12 }}>
              {grouped.map(([cat, catItems]) => {
                const plannedForCat = catItems.reduce((sum, i) => sum + (i.amount || 0), 0);
                const label = displayCategory(cat as any);
                const isCreditCards = String(cat) === "Credit Cards";

                return (
                  <React.Fragment key={String(cat)}>
                    <Card>
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

                    {/* Credit Card Payments under Credit Cards */}
                    {isCreditCards ? (
                      <Card>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Credit Card Payments</Text>
                            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                              Extra payments you made (reduces remainder + lowers the card balance).
                            </Text>
                          </View>

                          <TextBtn
                            label={paymentsCollapsed ? "Show" : "Hide"}
                            onPress={() => setPaymentsCollapsed((v) => !v)}
                          />
                        </View>

                        {paymentsCollapsed ? null : (
                          <>
                            <Divider />

                            {payableCards.length === 0 ? (
                              <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                                No active card balances. Paid-off cards are hidden automatically.
                              </Text>
                            ) : (
                              <>
                                <Text style={{ color: COLORS.muted, ...TYPE.label }}>Select card</Text>

                                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                                  {payableCards.map((c) => (
                                    <Pressable
                                      key={c.id}
                                      onPress={() => setPayCardId(c.id)}
                                      style={{
                                        paddingVertical: 8,
                                        paddingHorizontal: 10,
                                        borderRadius: 999,
                                        borderWidth: 1,
                                        borderColor:
                                          payCardId === c.id ? "rgba(34,197,94,0.35)" : COLORS.borderSoft,
                                        backgroundColor:
                                          payCardId === c.id ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)",
                                      }}
                                    >
                                      <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>
                                        {c.name || "Card"} • {fmtMoney(c.balance || 0)}
                                      </Text>
                                    </Pressable>
                                  ))}
                                </View>

                                <Field
                                  label="Amount paid"
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
                                      const ok = addCardPayment(payCardId, payAmount);
                                      if (!ok) return;
                                      setPayAmount("");
                                      Keyboard.dismiss();
                                    }}
                                  />
                                  <TextBtn label="Clear" onPress={() => setPayAmount("")} />
                                </View>
                              </>
                            )}

                            {payments.length > 0 ? (
                              <>
                                <Divider />
                                <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>This cycle payments</Text>
                                <View style={{ marginTop: 10, gap: 10 }}>
                                  {payments.map((p) => {
                                    const card = (settings.creditCards || []).find((c) => c.id === p.cardId);
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
                                              label="Remove"
                                              kind="red"
                                              onPress={() => removeCardPayment(viewCycle.id, p.id)}
                                            />
                                          </View>
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              </>
                            ) : null}
                          </>
                        )}
                      </Card>
                    ) : null}
                  </React.Fragment>
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
                  <TextBtn label="Add" kind="green" onPress={() => setSheetOpen(true)} />
                </View>

                {unexpected.length > 0 ? (
                  <>
                    <Divider />
                    <View style={{ gap: 10 }}>
                      {unexpected.map((x) => {
                        // @ts-ignore (x.cardId exists once you updated the type)
                        const cardName = x.cardId
                          ? (settings.creditCards || []).find((c) => c.id === x.cardId)?.name
                          : null;

                        return (
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
                                  {cardName ? ` • ${cardName}` : ""}
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
                        );
                      })}
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

          {/* Add unexpected bottom sheet */}
          <BottomSheet
            visible={sheetOpen}
            onClose={() => {
              setSheetOpen(false);
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

            {/* Card selector for unexpected */}
            <Text style={{ color: COLORS.muted, ...TYPE.label, marginTop: 10 }}>Paid with</Text>
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              <Pressable
                onPress={() => setUxCardId("")}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: uxCardId === "" ? "rgba(34,197,94,0.35)" : COLORS.borderSoft,
                  backgroundColor: uxCardId === "" ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)",
                }}
              >
                <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Cash / Debit</Text>
              </Pressable>

              {(settings.creditCards || []).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setUxCardId(c.id)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: uxCardId === c.id ? "rgba(34,197,94,0.35)" : COLORS.borderSoft,
                    backgroundColor: uxCardId === c.id ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)",
                  }}
                >
                  <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>{c.name || "Card"}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <TextBtn
                label="Add"
                kind="green"
                disabled={Number(uxAmount) <= 0}
                onPress={() => {
                  // If your usePayflow addUnexpected supports cardId, pass it here.
                  // @ts-ignore
                  const ok = addUnexpected(uxLabel, uxAmount, uxCardId || undefined);
                  if (!ok) return;
                  setUxLabel("");
                  setUxAmount("");
                  setUxCardId("");
                  Keyboard.dismiss();
                  setSheetOpen(false);
                }}
              />
              <TextBtn label="Cancel" onPress={() => setSheetOpen(false)} />
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
