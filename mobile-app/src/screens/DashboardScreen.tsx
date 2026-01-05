// src/screens/DashboardScreen.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  findNodeHandle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardHeight } from "@/src/hooks/useKeyboardHeight";
import { usePayflow } from "@/src/state/PayFlowProvider";
import { displayCategory, fmtMoney, formatDate, type CreditCard } from "@/src/state/usePayflow";
import { Card, Chip, COLORS, Divider, Field, TextBtn, TYPE } from "@/src/ui/common";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ---------------- Helpers ---------------- */

function getDaysRemaining(targetDate: string | Date) {
  const target = new Date(targetDate);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Paid";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `${diffDays} days`;
}

/* ---------------- Components ---------------- */

const ListRow = React.memo(function ListRow({
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
      style={[
        styles.listRow,
        { backgroundColor: checked ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.03)" },
      ]}
    >
      <View style={styles.listRowContent}>
        <View
          style={[
            styles.checkbox,
            {
              borderColor: checked ? "rgba(34,197,94,0.70)" : "rgba(255,255,255,0.20)",
              backgroundColor: checked ? "rgba(34,197,94,0.20)" : "transparent",
            },
          ]}
        >
          <Text style={styles.checkboxText}>{checked ? "✓" : ""}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.textStrong}>{title}</Text>
          {subtitle ? <Text style={styles.listSubtitle}>{subtitle}</Text> : null}
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.textStrong}>{amount}</Text>
        </View>
      </View>
    </Pressable>
  );
});

function ProgressBar({ current, total, pct }: { current: number; total: number; pct: number }) {
  return (
    <View style={{ marginTop: 4 }}>
      <View style={styles.progressRow}>
        <Text style={[styles.body, { color: COLORS.muted, fontSize: 13 }]}>Progress</Text>
        <Text style={[styles.textStrong, { fontSize: 13 }]}>
          {current}/{total} ({pct}%)
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, pct))}%` }]} />
      </View>
    </View>
  );
}

function CycleHeader({
  cycleOffset,
  payday,
  onPrev,
  onNext,
  onReset,
}: {
  cycleOffset: number;
  payday: string;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
}) {
  const daysLeftStr = getDaysRemaining(payday);
  const isFuture = daysLeftStr !== "Paid";
  const isCurrentCycle = cycleOffset === 0;

  let mainLabel = "";
  if (isCurrentCycle && isFuture) mainLabel = daysLeftStr;
  else if (isCurrentCycle) mainLabel = "Current Cycle";
  else mainLabel = cycleOffset > 0 ? `Next +${cycleOffset}` : `Prev ${cycleOffset}`;

  const showGreen = isCurrentCycle && isFuture;

  return (
    <Card>
      <View style={{ gap: 10 }}>
        <View style={styles.row}>
          <TextBtn label="◀︎" onPress={onPrev} />
          
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text
              style={[
                styles.textStrong,
                showGreen && { color: "#4ade80", textTransform: "uppercase", fontSize: 16, fontWeight: "900" },
              ]}
            >
              {mainLabel}
            </Text>
            <Text style={styles.cycleDate}>Payday {formatDate(new Date(payday))}</Text>
          </View>

          <TextBtn label="▶︎" onPress={onNext} />
        </View>

        {cycleOffset !== 0 && (
          <View style={{ marginTop: 10, alignItems: "center" }}>
            <TextBtn label="Back to current" onPress={onReset} kind="green" />
          </View>
        )}
      </View>
    </Card>
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
      <Pressable onPress={onClose} style={styles.modalOverlay} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={keyboardOffset}
        style={styles.modalKeyboardContainer}
      >
        <View style={[styles.modalContent, { paddingBottom: 12 + bottomInset + extraBottom }]}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHandle} />
            <View style={styles.modalTitleRow}>
              <Text style={styles.h2}>{title}</Text>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Chip>{value}</Chip>
    </View>
  );
}

const CompletedTab = () => (
  <View style={styles.completedTab}>
    <Text style={styles.completedTabText}>Completed</Text>
  </View>
);

/* ---------------- Main Screen ---------------- */

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
    payments,
    manualPaymentsTotal,
    addCardPayment,
    removeCardPayment,
    reload, 
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

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"unexpected" | "payment">("unexpected");
  const [refreshing, setRefreshing] = useState(false);

  const [labelInput, setLabelInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string>("");

  const [paymentsCollapsed, setPaymentsCollapsed] = useState(true);
  const [summaryCollapsed, setSummaryCollapsed] = useState(true);

  const payableCards: CreditCard[] = useMemo(
    () => (settings.creditCards || []).filter((c) => (c.balance || 0) > 0),
    [settings.creditCards]
  );
  
  const creditCardDebtTotal = useMemo(
    () => (settings.creditCards || []).reduce((sum, c) => sum + (c.balance || 0), 0),
    [settings.creditCards]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const openSheet = (mode: "unexpected" | "payment") => {
    setSheetMode(mode);
    setLabelInput("");
    setAmountInput("");
    setSelectedCardId("");
    if (mode === "payment" && payableCards.length > 0) {
      setSelectedCardId(payableCards[0].id);
    }
    setSheetOpen(true);
  };

  const handleSubmit = () => {
    if (Number(amountInput) <= 0) return;

    let success = false;
    if (sheetMode === "unexpected") {
      success = addUnexpected(labelInput || "Unexpected", amountInput, selectedCardId || undefined);
    } else {
      success = addCardPayment(selectedCardId, amountInput);
    }

    if (success) {
      setSheetOpen(false);
      Keyboard.dismiss();
    }
  };

  // ✅ Auto-collapse Logic
  const [catOpen, setCatOpen] = useState<Record<string, boolean>>({});

  const catComplete = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const [cat, catItems] of grouped) {
      const key = String(cat);
      out[key] = catItems.length > 0 && catItems.every((it) => !!activeChecked[it.id]?.checked);
    }
    return out;
  }, [grouped, activeChecked]);

  const prevCatCompleteRef = useRef<Record<string, boolean>>({});

  React.useEffect(() => {
    let shouldAnimate = false;

    setCatOpen((prev) => {
      const next = { ...prev };
      const prevMap = prevCatCompleteRef.current || {};
      
      for (const [cat] of grouped) {
        const key = String(cat);
        // Default to open if undefined
        if (typeof next[key] !== "boolean") next[key] = true;
        
        const wasComplete = !!prevMap[key];
        const isComplete = !!catComplete[key];

        // 1. Just became complete? -> Auto-collapse
        if (!wasComplete && isComplete) {
           next[key] = false;
           shouldAnimate = true;
        }

        // 2. Just became incomplete? -> Auto-expand (Force open)
        if (wasComplete && !isComplete) {
           next[key] = true;
           shouldAnimate = true;
        }
      }
      return next;
    });

    if (shouldAnimate) {
       LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }

    prevCatCompleteRef.current = { ...catComplete };
  }, [grouped, catComplete]);

  const toggleCategoryOpen = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCatOpen((prev) => {
      const curr = typeof prev[key] === "boolean" ? prev[key] : true;
      return { ...prev, [key]: !curr };
    });
  };

  const hasCreditCardsCategory = useMemo(
    () => grouped.some(([cat]) => String(cat) === "Credit Cards"),
    [grouped]
  );

  // --- Rendering ---

  if (!loaded) {
    return (
      <SafeAreaView style={styles.fullScreen} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <Text style={styles.textStrong}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasCompletedSetup) {
    return (
      <SafeAreaView style={styles.fullScreen} edges={["top", "left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={styles.welcomeContainer}>
          <Card>
            <Text style={styles.h1}>Welcome</Text>
            <Text style={[styles.mutedText, { marginTop: 6 }]}>
              Go to <Text style={styles.textStrong}>Settings</Text> to complete setup.
            </Text>
            <Divider />
            <TextBtn label="Mark setup complete (dev)" kind="green" onPress={() => setHasCompletedSetup(true)} />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.fullScreen} edges={["top", "left", "right"]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={keyboardOffset}
      >
        <View style={[styles.mainContainer, { paddingBottom: 14 + insets.bottom }]}>
          <ScrollView
            ref={scrollRef}
            style={{ marginTop: 0 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingTop: 2, paddingBottom: 260 + keyboardHeight }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.muted} />
            }
          >
            {/* Header */}
            <CycleHeader
              cycleOffset={cycleOffset}
              payday={viewCycle.payday.toISOString()}
              onPrev={() => setCycleOffset((o) => o - 1)}
              onNext={() => setCycleOffset((o) => o + 1)}
              onReset={() => setCycleOffset(0)}
            />

            {/* Summary */}
            <View style={{ marginTop: 12 }}>
              <Card>
                <View style={[styles.row, { gap: 10 }]}>
                  <Text style={styles.h2}>Summary</Text>
                  <TextBtn label={summaryCollapsed ? "Show" : "Hide"} onPress={() => setSummaryCollapsed((v) => !v)} />
                </View>

                <Divider />
                <ProgressBar
                  current={totals.itemsDone}
                  total={totals.itemsTotal}
                  pct={totals.pct}
                />

                {!summaryCollapsed && (
                  <>
                    <Divider />
                    <View style={{ gap: 10 }}>
                      <Row label="Pay amount" value={fmtMoney(settings.payAmount)} />
                      <Row label="Credit Card Debt" value={fmtMoney(creditCardDebtTotal)} />
                      <Row label="Personal spending" value={fmtMoney(personalSpendingTotal)} />
                      <Row label="Debt remaining" value={fmtMoney(settings.debtRemaining)} />
                      <Row label="Manual payments" value={fmtMoney(manualPaymentsTotal)} />
                      <Row label="Unexpected" value={fmtMoney(unexpectedTotal)} />
                      <Row label="Planned" value={fmtMoney(totals.planned)} />
                      <Row label="Completed" value={fmtMoney(totals.done)} />
                    </View>
                  </>
                )}
              </Card>
            </View>

            {/* Checklist Groups */}
            <View style={{ marginTop: 12, gap: 12 }}>
              {grouped.map(([cat, catItems]) => {
                const plannedForCat = catItems.reduce((sum, i) => sum + (i.amount || 0), 0);
                const label = displayCategory(cat as any);
                const catKey = String(cat);
                const isComplete = !!catComplete[catKey];
                const isOpen = typeof catOpen[catKey] === "boolean" ? catOpen[catKey] : true;

                return (
                  <React.Fragment key={String(cat)}>
                    <Card>
                      <Pressable
                        onPress={() => toggleCategoryOpen(catKey)}
                        style={[
                          styles.catHeader,
                          { backgroundColor: isComplete && !isOpen ? "rgba(34,197,94,0.12)" : "transparent" },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.h2}>{label}</Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          {isComplete ? <CompletedTab /> : null}
                          <Chip>{fmtMoney(plannedForCat)} planned</Chip>
                          <Text style={styles.textStrong}>{isOpen ? "▾" : "▸"}</Text>
                        </View>
                      </Pressable>

                      {isOpen ? (
                        <>
                          <Divider />
                          <View style={{ gap: 10 }}>
                            {catItems.map((it) => {
                              const state = activeChecked[it.id];
                              const isChecked = !!state?.checked;
                              
                              const subtitleParts: string[] = [];
                              if (it.notes) subtitleParts.push(it.notes);
                              if (isChecked && state?.at) subtitleParts.push(`checked ${new Date(state.at).toLocaleString()}`);
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
                        </>
                      ) : (
                        <>
                          <Divider />
                          <Text style={styles.mutedText}>
                            {isComplete ? "All items completed. Tap to expand." : "Tap to expand."}
                          </Text>
                        </>
                      )}
                    </Card>
                  </React.Fragment>
                );
              })}
            </View>

            {/* Credit Card Payments Section */}
            {hasCreditCardsCategory && (
              <View style={{ marginTop: 12 }}>
                <Card>
                  <View style={[styles.row, { gap: 10 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.h2}>Credit Card Payments</Text>
                      <Text style={[styles.mutedText, { marginTop: 6 }]}>Extra payments log.</Text>
                    </View>
                    <TextBtn label={paymentsCollapsed ? "Show" : "Hide"} onPress={() => setPaymentsCollapsed((v) => !v)} />
                  </View>

                  {!paymentsCollapsed && (
                    <>
                      <Divider />
                      <TextBtn label="+ Log new payment" kind="green" onPress={() => openSheet("payment")} />

                      {payments.length > 0 ? (
                        <>
                          <Divider />
                          <View style={{ gap: 10 }}>
                            {payments.map((p) => {
                              const card = (settings.creditCards || []).find((c) => c.id === p.cardId);
                              return (
                                <View key={p.id} style={styles.listItemBox}>
                                  <View style={[styles.row, { gap: 10 }]}>
                                    <View style={{ flex: 1 }}>
                                      <Text style={styles.textStrong}>{card?.name || "Credit Card"}</Text>
                                      <Text style={[styles.mutedText, { marginTop: 4 }]}>
                                        {fmtMoney(p.amount)} • {new Date(p.atISO).toLocaleString()}
                                      </Text>
                                    </View>
                                    <View style={{ alignItems: "flex-end", gap: 8 }}>
                                      <Chip>{fmtMoney(p.amount)}</Chip>
                                      <TextBtn label="Remove" kind="red" onPress={() => removeCardPayment(viewCycle.id, p.id)} />
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
                          <Text style={styles.mutedText}>No extra payments logged this cycle.</Text>
                        </>
                      )}
                    </>
                  )}
                </Card>
              </View>
            )}

            {/* Unexpected Section */}
            <View style={{ marginTop: 12 }}>
              <Card>
                <View style={[styles.row, { gap: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h2}>Unexpected (this cycle)</Text>
                    <Text style={[styles.mutedText, { marginTop: 4 }]}>
                      Total: <Text style={styles.textStrong}>{fmtMoney(unexpectedTotal)}</Text>
                    </Text>
                  </View>
                  <TextBtn label="Add" kind="green" onPress={() => openSheet("unexpected")} />
                </View>

                {unexpected.length > 0 ? (
                  <>
                    <Divider />
                    <View style={{ gap: 10 }}>
                      {unexpected.map((x) => {
                        const cardName = x.cardId ? (settings.creditCards || []).find((c) => c.id === x.cardId)?.name : null;
                        return (
                          <View key={x.id} style={styles.listItemBox}>
                            <View style={[styles.row, { gap: 10 }]}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.textStrong}>{x.label}</Text>
                                <Text style={[styles.mutedText, { marginTop: 4 }]}>
                                  {fmtMoney(x.amount)} • {new Date(x.atISO).toLocaleString()}
                                  {cardName ? ` • ${cardName}` : ""}
                                </Text>
                              </View>
                              <View style={{ alignItems: "flex-end", gap: 8 }}>
                                <Chip>{fmtMoney(x.amount)}</Chip>
                                <TextBtn label="Remove" kind="red" onPress={() => removeUnexpected(viewCycle.id, x.id)} />
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
                    <Text style={styles.mutedText}>None yet. Tap “Add” to record one.</Text>
                  </>
                )}
              </Card>
            </View>

            <Text style={styles.footerText}>Offline • Saved on-device</Text>
          </ScrollView>

          {/* Combined Bottom Sheet for Adding Unexpected OR Payments */}
          <BottomSheet
            visible={sheetOpen}
            onClose={() => {
              setSheetOpen(false);
              Keyboard.dismiss();
            }}
            title={sheetMode === "unexpected" ? "Add unexpected expense" : "Log Card Payment"}
            bottomInset={insets.bottom}
            keyboardHeight={keyboardHeight}
            keyboardOffset={keyboardOffset}
          >
            <Text style={styles.mutedText}>
              {sheetMode === "unexpected" 
                ? "Add a one-off cost for this pay cycle."
                : "Record an extra payment made to a credit card."}
            </Text>

            {sheetMode === "unexpected" && (
              <Field
                label="Label"
                value={labelInput}
                onChangeText={setLabelInput}
                placeholder="Car repair"
                onFocusScrollToInput={scrollToInput}
                clearOnFocus
              />
            )}

            <Field
              label="Amount"
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="numeric"
              placeholder="0"
              onFocusScrollToInput={scrollToInput}
              clearOnFocus
            />

            <Text style={[styles.label, { marginTop: 10 }]}>
              {sheetMode === "unexpected" ? "Paid with" : "Select Card"}
            </Text>
            
            <View style={styles.chipRow}>
              {sheetMode === "unexpected" && (
                <Pressable
                  onPress={() => setSelectedCardId("")}
                  style={[
                    styles.selectionChip,
                    {
                      borderColor: selectedCardId === "" ? "rgba(34,197,94,0.35)" : COLORS.borderSoft,
                      backgroundColor: selectedCardId === "" ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)",
                    },
                  ]}
                >
                  <Text style={styles.textStrong}>Cash / Debit</Text>
                </Pressable>
              )}

              {(settings.creditCards || []).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setSelectedCardId(c.id)}
                  style={[
                    styles.selectionChip,
                    {
                      borderColor: selectedCardId === c.id ? "rgba(34,197,94,0.35)" : COLORS.borderSoft,
                      backgroundColor: selectedCardId === c.id ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)",
                    },
                  ]}
                >
                  <Text style={styles.textStrong}>{c.name || "Card"}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.actionRow}>
              <TextBtn
                label={sheetMode === "unexpected" ? "Add Expense" : "Log Payment"}
                kind="green"
                disabled={Number(amountInput) <= 0 || (sheetMode === "payment" && !selectedCardId)}
                onPress={handleSubmit}
              />
              <TextBtn label="Cancel" onPress={() => setSheetOpen(false)} />
            </View>
          </BottomSheet>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  mainContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 10, backgroundColor: COLORS.bg },
  welcomeContainer: { flex: 1, padding: 16, paddingTop: 10 },
  
  // Text
  textStrong: { color: COLORS.textStrong, fontWeight: "900" },
  mutedText: { color: COLORS.muted, fontWeight: "700" },
  label: { color: COLORS.muted, ...TYPE.label },
  h1: { color: COLORS.textStrong, ...TYPE.h1 },
  h2: { color: COLORS.textStrong, ...TYPE.h2 },
  body: { color: COLORS.muted, ...TYPE.body },
  cycleDate: { color: COLORS.muted, marginTop: 4, fontWeight: "700", textAlign: "center" },
  footerText: { color: COLORS.faint, marginTop: 14, textAlign: "center", fontWeight: "700" },

  // Layouts
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chipRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 8 },
  actionRow: { marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" },

  // Progress Bar
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  track: { height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "#22c55e", borderRadius: 999 },

  // List Items
  listRow: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  listRowContent: { flexDirection: "row", alignItems: "center", gap: 10 },
  listSubtitle: { color: COLORS.muted, marginTop: 3, fontWeight: "700", fontSize: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  checkboxText: { color: COLORS.textStrong, fontWeight: "900", fontSize: 12 },
  
  // Header
  catHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 16 },
  completedTab: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: "rgba(34,197,94,0.40)", backgroundColor: "rgba(34,197,94,0.14)" },
  completedTabText: { color: COLORS.textStrong, fontWeight: "900", fontSize: 12 },
  listItemBox: { padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", backgroundColor: "rgba(255,255,255,0.03)" },
  selectionChip: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  modalKeyboardContainer: { position: "absolute", left: 0, right: 0, bottom: 0 },
  modalContent: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg, maxHeight: "88%" },
  modalHeader: { paddingHorizontal: 16, paddingTop: 12 },
  modalHandle: { alignSelf: "center", width: 44, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: 10 },
  modalTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
});