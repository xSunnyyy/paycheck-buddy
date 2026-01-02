// src/screens/DashboardScreen.tsx
import React, { useRef, useState } from "react";
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

import { usePayflow } from "@/src/state/PayFlowProvider";
import {
  fmtMoney,
  formatDate,
  displayCategory,
} from "@/src/state/payflowHelpers";

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

  const [sheetOpen, setSheetOpen] = useState(false);
  const [uxLabel, setUxLabel] = useState("");
  const [uxAmount, setUxAmount] = useState("");

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
  // (We keep this minimal and non-looping.)
  if (!hasCompletedSetup) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={{ flex: 1, padding: 16, paddingTop: 10 + insets.top }}>
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
            style={{ marginTop: 12 }}
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
                  <Row label="Unexpected (this cycle)" value={fmtMoney(unexpectedTotal)} />
                  <Row label="Planned" value={fmtMoney(totals.planned)} />
                  <Row label="Completed" value={fmtMoney(totals.done)} />

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
                return (
                  <Card key={cat}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>{displayCategory(cat)}</Text>
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
                  <TextBtn label="Add" kind="green" onPress={() => setSheetOpen(true)} />
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
