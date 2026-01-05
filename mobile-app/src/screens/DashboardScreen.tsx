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
  LayoutAnimation,
  UIManager,
  StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardHeight } from "@/src/hooks/useKeyboardHeight";
import { usePayflow } from "@/src/state/PayFlowProvider";
import { fmtMoney, formatDate, displayCategory, type CreditCard } from "@/src/state/usePayflow";
import { Card, Chip, COLORS, Divider, Field, TextBtn, TYPE } from "@/src/ui/common";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- Helper Components ---

// ✅ IMPROVEMENT 1: React.memo
// This prevents the row from re-rendering if its specific data hasn't changed.
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
        {
          backgroundColor: checked ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.03)",
        },
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
          {subtitle ? (
            <Text style={styles.listSubtitle}>{subtitle}</Text>
          ) : null}
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.textStrong}>{amount}</Text>
        </View>
      </View>
    </Pressable>
  );
});

// ✅ IMPROVEMENT 2: Visual Progress Bar Component
function ProgressBar({ current, total, pct }: { current: number; total: number; pct: number }) {
  return (
    <View style={{ marginTop: 4 }}>
      <View style={styles.progressRow}>
        <Text style={[styles.body, { color: COLORS.muted, fontSize: 13 }]}>
          Progress
        </Text>
        <Text style={[styles.textStrong, { fontSize: 13 }]}>
          {current}/{total} ({pct}%)
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

// ✅ IMPROVEMENT 3: Extracted Cycle Header
// Keeps the main component cleaner
function CycleHeader({ 
  cycleOffset, 
  payday, 
  onPrev, 
  onNext, 
  onReset 
}: { 
  cycleOffset: number; 
  payday: string; 
  onPrev: () => void; 
  onNext: () => void; 
  onReset: () => void; 
}) {
  return (
    <Card>
      <View style={{ gap: 10 }}>
        <View style={styles.row}>
          <TextBtn label="◀︎" onPress={onPrev} />
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={styles.textStrong}>
              {cycleOffset === 0
                ? "This paycheck"
                : cycleOffset > 0
                ? `Next +${cycleOffset}`
                : `Prev ${cycleOffset}`}
            </Text>
            <Text style={styles.cycleDate}>
              Payday {formatDate(payday)}
            </Text>
          </View>
          <TextBtn label="▶︎" onPress={onNext} />
        </View>

        {cycleOffset !== 0 ? (
          <View style={{ marginTop: 10, alignItems: "center" }}>
            <TextBtn label="Back to current" onPress={onReset} kind="green" />
          </View>
        ) : null}
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

// --- Main Screen ---

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

  // UI State
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uxLabel, setUxLabel] = useState("");
  const [uxAmount, setUxAmount] = useState("");
  const [uxCardId, setUxCardId] = useState<string>(""); 
  const [payCardId, setPayCardId] = useState<string>("");
  const [payAmount, setPayAmount] = useState("");
  const [paymentsCollapsed, setPaymentsCollapsed] = useState(true);
  const [summaryCollapsed, setSummaryCollapsed] = useState(true);

  // Logic: Cards
  const payableCards: CreditCard[] = useMemo(
    () => (settings.creditCards || []).filter((c) => (c.balance || 0) > 0),
    [settings.creditCards]
  );

  const creditCardDebtTotal = useMemo(
    () => (settings.creditCards || []).reduce((sum, c) => sum + (c.balance || 0), 0),
    [settings.creditCards]
  );

  React.useEffect(() => {
    if (!payCardId && payableCards.length > 0) setPayCardId(payableCards[0].id);
  }, [payCardId, payableCards]);

  // Logic: Auto-collapse categories
  const [catOpen, setCatOpen] = useState<Record<string, boolean>>({});
  const [catUserOpenedWhileComplete, setCatUserOpenedWhileComplete] = useState<Record<string, boolean>>({});

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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    setCatOpen((prev) => {
      const next = { ...prev };
      for (const [cat] of grouped) {
        const key = String(cat);
        if (typeof next[key] !== "boolean") next[key] = true;
      }
      const prevMap = prevCatCompleteRef.current || {};
      for (const [cat] of grouped) {
        const key = String(cat);
        const was = !!prevMap[key];
        const now = !!catComplete[key];
        const override = !!catUserOpenedWhileComplete[key];

        if (!was && now && !override) next[key] = false;
        if (was && !now) next[key] = true;
        if (now && !override) next[key] = false;
      }
      return next;
    });

    setCatUserOpenedWhileComplete((prev) => {
      const next = { ...prev };
      const prevMap = prevCatCompleteRef.current || {};
      for (const [cat] of grouped) {
        const key = String(cat);
        const was = !!prevMap[key];
        const now = !!catComplete[key];
        if (was && !now) next[key] = false;
      }
      return next;
    });

    prevCatCompleteRef.current = { ...catComplete };
  }, [grouped, catComplete, catUserOpenedWhileComplete]);

  const toggleCategoryOpen = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCatOpen((prev) => {
      const curr = typeof prev[key] === "boolean" ? prev[key] : true;
      const nextOpen = !curr;
      if (catComplete[key] && nextOpen) {
        setCatUserOpenedWhileComplete((m) => ({ ...m, [key]: true }));
      }
      if (catComplete[key] && !nextOpen) {
        setCatUserOpenedWhileComplete((m) => ({ ...m, [key]: false }));
      }
      return { ...prev, [key]: nextOpen };
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
          >
            {/* Extracted Cycle Header */}
            <CycleHeader 
              cycleOffset={cycleOffset}
              payday={viewCycle.payday}
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

                {/* VISUAL PROGRESS BAR HERE */}
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
                      <Row label="Personal spending (per pay)" value={fmtMoney(personalSpendingTotal)} />
                      <Row label="Debt remaining (other)" value={fmtMoney(settings.debtRemaining)} />
                      <Row label="Manual card payments" value={fmtMoney(manualPaymentsTotal)} />
                      <Row label="Unexpected" value={fmtMoney(unexpectedTotal)} />
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
                          { backgroundColor: isComplete && !isOpen ? "rgba(34,197,94,0.12)" : "transparent" }
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
                              
                              // Logic for subtitle
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

            {/* Credit Card Payments */}
            {hasCreditCardsCategory ? (
              <View style={{ marginTop: 12 }}>
                <Card>
                  <View style={[styles.row, { gap: 10 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.h2}>Credit Card Payments</Text>
                      <Text style={[styles.mutedText, { marginTop: 6 }]}>
                        Extra payments you made.
                      </Text>
                    </View>
                    <TextBtn label={paymentsCollapsed ? "Show" : "Hide"} onPress={() => setPaymentsCollapsed((v) => !v)} />
                  </View>

                  {!paymentsCollapsed && (
                    <>
                      <Divider />
                      {payableCards.length === 0 ? (
                        <Text style={styles.mutedText}>No active card balances.</Text>
                      ) : (
                        <>
                          <Text style={styles.label}>Select card</Text>
                          <View style={styles.chipRow}>
                            {payableCards.map((c) => (
                              <Pressable
                                key={c.id}
                                onPress={() => setPayCardId(c.id)}
                                style={[
                                  styles.selectionChip,
                                  {
                                    borderColor: payCardId === c.id ? "rgba(34,197,94,0.35)" : COLORS.borderSoft,
                                    backgroundColor: payCardId === c.id ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)",
                                  }
                                ]}
                              >
                                <Text style={styles.textStrong}>
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

                          <View style={styles.actionRow}>
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

                      {payments.length > 0 && (
                        <>
                          <Divider />
                          <Text style={styles.textStrong}>This cycle payments</Text>
                          <View style={{ marginTop: 10, gap: 10 }}>
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
                      )}
                    </>
                  )}
                </Card>
              </View>
            ) : null}

            {/* Unexpected */}
            <View style={{ marginTop: 12 }}>
              <Card>
                <View style={[styles.row, { gap: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h2}>Unexpected (this cycle)</Text>
                    <Text style={[styles.mutedText, { marginTop: 4 }]}>
                      Total: <Text style={styles.textStrong}>{fmtMoney(unexpectedTotal)}</Text>
                    </Text>
                  </View>
                  <TextBtn label="Add" kind="green" onPress={() => setSheetOpen(true)} />
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

          {/* Bottom Sheet for Adding Unexpected */}
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
            <Text style={styles.mutedText}>
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

            <Text style={[styles.label, { marginTop: 10 }]}>Paid with</Text>
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setUxCardId("")}
                style={[
                  styles.selectionChip,
                  {
                    borderColor: uxCardId === "" ? "rgba(34,197,94,0.35)" : COLORS.borderSoft,
                    backgroundColor: uxCardId === "" ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)",
                  }
                ]}
              >
                <Text style={styles.textStrong}>Cash / Debit</Text>
              </Pressable>

              {(settings.creditCards || []).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setUxCardId(c.id)}
                  style={[
                    styles.selectionChip,
                    {
                      borderColor: uxCardId === c.id ? "rgba(34,197,94,0.35)" : COLORS.borderSoft,
                      backgroundColor: uxCardId === c.id ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)",
                    }
                  ]}
                >
                  <Text style={styles.textStrong}>{c.name || "Card"}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.actionRow}>
              <TextBtn
                label="Add"
                kind="green"
                disabled={Number(uxAmount) <= 0}
                onPress={() => {
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
  mainContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: COLORS.bg,
  },
  welcomeContainer: {
    flex: 1,
    padding: 16,
    paddingTop: 10,
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
  label: {
    color: COLORS.muted,
    ...TYPE.label,
  },
  h1: {
    color: COLORS.textStrong,
    ...TYPE.h1,
  },
  h2: {
    color: COLORS.textStrong,
    ...TYPE.h2,
  },
  body: {
    color: COLORS.muted,
    ...TYPE.body,
  },
  cycleDate: {
    color: COLORS.muted,
    marginTop: 4,
    fontWeight: "700",
    textAlign: "center",
  },
  footerText: {
    color: COLORS.faint,
    marginTop: 14,
    textAlign: "center",
    fontWeight: "700",
  },

  // Layouts
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chipRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 8,
  },
  actionRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },

  // Progress Bar
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  track: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: "#22c55e", // Green color matching your theme
    borderRadius: 999,
  },

  // List Items
  listRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  listRowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  listSubtitle: {
    color: COLORS.muted,
    marginTop: 3,
    fontWeight: "700",
    fontSize: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxText: {
    color: COLORS.textStrong,
    fontWeight: "900",
    fontSize: 12,
  },
  
  // Checklist Category Header
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderRadius: 16,
  },
  completedTab: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.40)",
    backgroundColor: "rgba(34,197,94,0.14)",
  },
  completedTabText: {
    color: COLORS.textStrong,
    fontWeight: "900",
    fontSize: 12,
  },
  listItemBox: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  selectionChip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalKeyboardContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    maxHeight: "88%",
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  modalHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 10,
  },
  modalTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
});