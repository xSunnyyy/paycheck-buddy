// mobile-app/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";

type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

type Bill = {
  id: string;
  name: string;
  amount: number; // default 0
  dueDay: number; // 1-31
  type: "bill" | "monthly"; // monthly shows as one combined item later
};

type AppData = {
  setupComplete: boolean;

  // Pay / income
  paycheckAmount: number; // default 0
  payFrequency: PayFrequency; // default biweekly
  paydayAnchorISO: string; // date picker
  dateFormat: DateFormat; // dropdown
  paychecksPerMonthEstimate: number; // optional helper for UI (default 2)

  // Debt
  totalDebt: number; // default 0
  weeklyDebtPaydown: number; // default 0 (auto-decrease per week if you want)

  // Bills / monthly
  bills: Bill[]; // amounts default 0
};

const STORAGE_KEY = "paycheck_buddy_v1";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(n) ? n : 0);

function clampInt(n: number, min: number, max: number) {
  const x = Math.floor(Number.isFinite(n) ? n : 0);
  return Math.max(min, Math.min(max, x));
}

function toNumberSafe(v: string) {
  // allows blank -> 0, strips commas/$
  const cleaned = v.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(dateISO: string, fmt: DateFormat) {
  const d = new Date(dateISO);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  if (fmt === "DD/MM/YYYY") return `${dd}/${mm}/${yyyy}`;
  if (fmt === "YYYY-MM-DD") return `${yyyy}-${mm}-${dd}`;
  return `${mm}/${dd}/${yyyy}`;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const DEFAULT_DATA: AppData = {
  setupComplete: false,

  paycheckAmount: 0,
  payFrequency: "biweekly",
  paydayAnchorISO: new Date().toISOString(),
  dateFormat: "MM/DD/YYYY",
  paychecksPerMonthEstimate: 2,

  totalDebt: 0,
  weeklyDebtPaydown: 0,

  bills: [
    { id: uid(), name: "Example bill (edit me)", amount: 0, dueDay: 1, type: "bill" },
    { id: uid(), name: "Monthly expenses (combined)", amount: 0, dueDay: 1, type: "monthly" },
  ],
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AppData>(DEFAULT_DATA);

  const [showSetup, setShowSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Date picker UI state
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          setData(DEFAULT_DATA);
          setShowSetup(true);
          setLoading(false);
          return;
        }
        const parsed = JSON.parse(raw) as AppData;
        if (!parsed?.setupComplete) {
          setData({ ...DEFAULT_DATA, ...parsed, setupComplete: false });
          setShowSetup(true);
        } else {
          setData(parsed);
          setShowSetup(false);
        }
      } catch {
        setData(DEFAULT_DATA);
        setShowSetup(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(next: AppData) {
    setData(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function resetAll() {
    Alert.alert("Reset everything?", "This will erase all saved data on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem(STORAGE_KEY);
          setData(DEFAULT_DATA);
          setShowSettings(false);
          setShowSetup(true);
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Paycheck Buddy</Text>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (showSetup) {
    return (
      <SetupScreen
        initial={data}
        onSave={async (next) => {
          // Keep your rule: all initial values can be 0; user can edit later.
          const finalData: AppData = { ...next, setupComplete: true };
          await save(finalData);
          setShowSetup(false);
          setShowSettings(false);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.appHeader}>
        <Text style={styles.title}>Paycheck Buddy</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable style={styles.headerBtn} onPress={() => setShowSettings((s) => !s)}>
            <Text style={styles.headerBtnText}>{showSettings ? "Close" : "Settings"}</Text>
          </Pressable>
        </View>
      </View>

      {showSettings ? (
        <SettingsScreen
          data={data}
          onChange={async (next) => save(next)}
          onResetAll={resetAll}
          onReRunSetup={() => setShowSetup(true)}
        />
      ) : (
        <DashboardPlaceholder data={data} />
      )}
    </SafeAreaView>
  );
}

/** ---------------- Setup Screen ---------------- */

function SetupScreen({
  initial,
  onSave,
}: {
  initial: AppData;
  onSave: (next: AppData) => void;
}) {
  const [draft, setDraft] = useState<AppData>(() => ({
    ...DEFAULT_DATA,
    ...initial,
    setupComplete: false,
    // ensure defaults are 0 even if missing
    paycheckAmount: initial.paycheckAmount ?? 0,
    totalDebt: initial.totalDebt ?? 0,
    weeklyDebtPaydown: initial.weeklyDebtPaydown ?? 0,
  }));

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const paychecksPerMonthEstimate = useMemo(() => {
    const f = draft.payFrequency;
    if (f === "weekly") return 4;
    if (f === "biweekly") return 2;
    if (f === "semimonthly") return 2;
    return 1;
  }, [draft.payFrequency]);

  useEffect(() => {
    setDraft((d) => ({ ...d, paychecksPerMonthEstimate }));
  }, [paychecksPerMonthEstimate]);

  function setBill(id: string, patch: Partial<Bill>) {
    setDraft((d) => ({
      ...d,
      bills: d.bills.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }

  function addBill(type: Bill["type"]) {
    setDraft((d) => ({
      ...d,
      bills: [
        ...d.bills,
        {
          id: uid(),
          name: type === "monthly" ? "Monthly expenses (combined)" : "New bill",
          amount: 0,
          dueDay: 1,
          type,
        },
      ],
    }));
  }

  function removeBill(id: string) {
    setDraft((d) => ({
      ...d,
      bills: d.bills.filter((b) => b.id !== id),
    }));
  }

  function onPickDate(_e: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== "ios") setShowDatePicker(false);
    if (!selected) return;
    setDraft((d) => ({ ...d, paydayAnchorISO: selected.toISOString() }));
  }

  const canNext = true; // you said defaults can be 0, so we allow progressing even with 0s

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.appHeader}>
        <Text style={styles.title}>First-time setup</Text>
        <Text style={styles.muted}>Everything is stored on this device (offline).</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.stepRow}>
          <StepPill active={step === 1} label="Pay" />
          <StepPill active={step === 2} label="Debt" />
          <StepPill active={step === 3} label="Bills" />
          <StepPill active={step === 4} label="Monthly" />
        </View>

        {step === 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pay / Income</Text>

            <Text style={styles.label}>Paycheck amount (default 0)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={String(draft.paycheckAmount || 0)}
              onChangeText={(t) => setDraft((d) => ({ ...d, paycheckAmount: toNumberSafe(t) }))}
            />
            <Text style={styles.helper}>This is the amount you get per paycheck.</Text>

            <Text style={[styles.label, { marginTop: 14 }]}>Pay frequency</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={draft.payFrequency}
                onValueChange={(v) => setDraft((d) => ({ ...d, payFrequency: v as PayFrequency }))}
                dropdownIconColor="rgba(255,255,255,0.9)"
                style={styles.picker}
              >
                <Picker.Item label="Weekly" value="weekly" />
                <Picker.Item label="Bi-weekly (every 2 weeks)" value="biweekly" />
                <Picker.Item label="Semi-monthly (twice per month)" value="semimonthly" />
                <Picker.Item label="Monthly" value="monthly" />
              </Picker>
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Date format</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={draft.dateFormat}
                onValueChange={(v) => setDraft((d) => ({ ...d, dateFormat: v as DateFormat }))}
                dropdownIconColor="rgba(255,255,255,0.9)"
                style={styles.picker}
              >
                <Picker.Item label="MM/DD/YYYY" value="MM/DD/YYYY" />
                <Picker.Item label="DD/MM/YYYY" value="DD/MM/YYYY" />
                <Picker.Item label="YYYY-MM-DD" value="YYYY-MM-DD" />
              </Picker>
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Payday anchor date</Text>
            <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dateButtonText}>
                {formatDate(draft.paydayAnchorISO, draft.dateFormat)}
              </Text>
              <Text style={styles.muted}>Tap to select</Text>
            </Pressable>

            {showDatePicker && (
              <DateTimePicker
                value={new Date(draft.paydayAnchorISO)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onPickDate}
              />
            )}

            <Text style={[styles.helper, { marginTop: 10 }]}>
              We use this date to calculate future pay cycles for your checklists.
            </Text>
          </View>
        )}

        {step === 2 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Debt</Text>

            <Text style={styles.label}>Total debt (default 0)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={String(draft.totalDebt || 0)}
              onChangeText={(t) => setDraft((d) => ({ ...d, totalDebt: toNumberSafe(t) }))}
            />
            <Text style={styles.helper}>One total debt number (not broken up).</Text>

            <Text style={[styles.label, { marginTop: 14 }]}>Weekly debt paydown (optional, default 0)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={String(draft.weeklyDebtPaydown || 0)}
              onChangeText={(t) => setDraft((d) => ({ ...d, weeklyDebtPaydown: toNumberSafe(t) }))}
            />
            <Text style={styles.helper}>
              If you enter a number here, the app can auto-decrease your debt weekly (later we’ll wire the logic into your checklist/history).
            </Text>

            <View style={styles.rowBetween}>
              <Text style={styles.muted}>Preview</Text>
              <Text style={styles.value}>{money(draft.totalDebt)}</Text>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Bills (each defaults to $0)</Text>
            <Text style={styles.helper}>
              Add your recurring bills. Amount can stay 0 for now.
            </Text>

            {draft.bills
              .filter((b) => b.type === "bill")
              .map((b) => (
                <View key={b.id} style={styles.billCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Bill name</Text>
                    <TextInput
                      style={styles.input}
                      value={b.name}
                      onChangeText={(t) => setBill(b.id, { name: t })}
                      placeholder="Rent / Phone / Insurance"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Amount</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={String(b.amount || 0)}
                      onChangeText={(t) => setBill(b.id, { amount: toNumberSafe(t) })}
                      placeholder="0"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Due day (1–31)</Text>
                    <View style={styles.pickerWrap}>
                      <Picker
                        selectedValue={b.dueDay}
                        onValueChange={(v) => setBill(b.id, { dueDay: clampInt(Number(v), 1, 31) })}
                        dropdownIconColor="rgba(255,255,255,0.9)"
                        style={styles.picker}
                      >
                        {Array.from({ length: 31 }).map((_, i) => {
                          const day = i + 1;
                          return <Picker.Item key={day} label={`${day}`} value={day} />;
                        })}
                      </Picker>
                    </View>
                  </View>

                  <Pressable style={styles.deleteBtn} onPress={() => removeBill(b.id)}>
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
                </View>
              ))}

            <Pressable style={styles.primaryBtn} onPress={() => addBill("bill")}>
              <Text style={styles.primaryBtnText}>+ Add bill</Text>
            </Pressable>
          </View>
        )}

        {step === 4 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Monthly expenses (combined)</Text>
            <Text style={styles.helper}>
              This stays as one combined item in your checklist (your requirement).
            </Text>

            {draft.bills
              .filter((b) => b.type === "monthly")
              .slice(0, 1)
              .map((b) => (
                <View key={b.id} style={styles.billCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Label</Text>
                    <TextInput
                      style={styles.input}
                      value={b.name}
                      onChangeText={(t) => setBill(b.id, { name: t })}
                      placeholder="Monthly expenses"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Monthly total (default 0)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={String(b.amount || 0)}
                      onChangeText={(t) => setBill(b.id, { amount: toNumberSafe(t) })}
                      placeholder="0"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>“Due day” (used for planning)</Text>
                    <View style={styles.pickerWrap}>
                      <Picker
                        selectedValue={b.dueDay}
                        onValueChange={(v) => setBill(b.id, { dueDay: clampInt(Number(v), 1, 31) })}
                        dropdownIconColor="rgba(255,255,255,0.9)"
                        style={styles.picker}
                      >
                        {Array.from({ length: 31 }).map((_, i) => {
                          const day = i + 1;
                          return <Picker.Item key={day} label={`${day}`} value={day} />;
                        })}
                      </Picker>
                    </View>
                  </View>
                </View>
              ))}

            <View style={styles.summaryBox}>
              <Text style={styles.muted}>Summary</Text>
              <Text style={styles.summaryLine}>Paycheck: {money(draft.paycheckAmount)}</Text>
              <Text style={styles.summaryLine}>Frequency: {draft.payFrequency}</Text>
              <Text style={styles.summaryLine}>Debt: {money(draft.totalDebt)}</Text>
              <Text style={styles.summaryLine}>
                Bills count: {draft.bills.filter((b) => b.type === "bill").length}
              </Text>
              <Text style={styles.summaryLine}>
                Monthly combined: {money(draft.bills.find((b) => b.type === "monthly")?.amount ?? 0)}
              </Text>
            </View>

            <Pressable
              style={[styles.primaryBtn, { marginTop: 12 }]}
              onPress={() => onSave(draft)}
            >
              <Text style={styles.primaryBtnText}>Finish setup</Text>
            </Pressable>

            <Text style={[styles.helper, { marginTop: 10 }]}>
              You can change everything later in Settings.
            </Text>
          </View>
        )}

        <View style={styles.navRow}>
          <Pressable
            style={[styles.secondaryBtn, step === 1 && { opacity: 0.4 }]}
            disabled={step === 1}
            onPress={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as any)))}
          >
            <Text style={styles.secondaryBtnText}>Back</Text>
          </Pressable>

          <Pressable
            style={[styles.primaryBtn, !canNext && { opacity: 0.4 }]}
            disabled={!canNext}
            onPress={() => {
              if (step === 4) return;
              setStep((s) => ((s + 1) as any));
            }}
          >
            <Text style={styles.primaryBtnText}>{step === 4 ? "Done" : "Next"}</Text>
          </Pressable>
        </View>

        <Text style={[styles.muted, { marginTop: 16, textAlign: "center" }]}>
          Tip: It’s okay to leave everything as 0 — you can fill it in later.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StepPill({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

/** ---------------- Settings Screen ---------------- */

function SettingsScreen({
  data,
  onChange,
  onResetAll,
  onReRunSetup,
}: {
  data: AppData;
  onChange: (next: AppData) => void;
  onResetAll: () => void;
  onReRunSetup: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Settings</Text>

        <View style={styles.rowBetween}>
          <Text style={styles.muted}>Paycheck amount</Text>
          <Text style={styles.value}>{money(data.paycheckAmount)}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.muted}>Frequency</Text>
          <Text style={styles.value}>{data.payFrequency}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.muted}>Anchor date</Text>
          <Text style={styles.value}>{formatDate(data.paydayAnchorISO, data.dateFormat)}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.muted}>Total debt</Text>
          <Text style={styles.value}>{money(data.totalDebt)}</Text>
        </View>

        <Pressable style={styles.primaryBtn} onPress={onReRunSetup}>
          <Text style={styles.primaryBtnText}>Edit setup</Text>
        </Pressable>

        <Pressable style={styles.dangerBtn} onPress={onResetAll}>
          <Text style={styles.dangerBtnText}>Reset all data</Text>
        </Pressable>

        <Text style={[styles.helper, { marginTop: 10 }]}>
          Next step: we’ll wire this saved data into your existing checklist logic (Bills dueDay, monthly combined, one debt number).
        </Text>
      </View>
    </ScrollView>
  );
}

/** ---------------- Dashboard Placeholder ----------------
 * This is where we plug in your current checklist logic next.
 * For now, it proves the setup + persistence works.
 */

function DashboardPlaceholder({ data }: { data: AppData }) {
  const billsTotal = data.bills.filter((b) => b.type === "bill").reduce((s, b) => s + (b.amount || 0), 0);
  const monthly = data.bills.find((b) => b.type === "monthly")?.amount ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Dashboard</Text>
        <Text style={styles.muted}>Saved on-device • offline</Text>

        <View style={{ height: 12 }} />

        <View style={styles.rowBetween}>
          <Text style={styles.muted}>Paycheck</Text>
          <Text style={styles.value}>{money(data.paycheckAmount)}</Text>
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.muted}>Frequency</Text>
          <Text style={styles.value}>{data.payFrequency}</Text>
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.muted}>Anchor date</Text>
          <Text style={styles.value}>{formatDate(data.paydayAnchorISO, data.dateFormat)}</Text>
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.muted}>Total debt</Text>
          <Text style={styles.value}>{money(data.totalDebt)}</Text>
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.muted}>Bills total</Text>
          <Text style={styles.value}>{money(billsTotal)}</Text>
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.muted}>Monthly combined</Text>
          <Text style={styles.value}>{money(monthly)}</Text>
        </View>

        <Text style={[styles.helper, { marginTop: 12 }]}>
          Next, I’ll paste the full “real” checklist dashboard that matches your current web logic (Bills dueDay + monthly combined + one total debt auto-decreasing).
        </Text>
      </View>
    </ScrollView>
  );
}

/** ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#070A10" },

  appHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },

  title: { color: "rgba(255,255,255,0.96)", fontSize: 20, fontWeight: "800" },
  muted: { color: "rgba(185,193,204,0.80)", marginTop: 4 },

  container: { padding: 16, gap: 12 },

  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 14,
  },
  cardTitle: { color: "rgba(255,255,255,0.96)", fontSize: 16, fontWeight: "800", marginBottom: 10 },

  label: { color: "rgba(255,255,255,0.90)", fontSize: 13, fontWeight: "700" },
  helper: { color: "rgba(185,193,204,0.75)", fontSize: 12, marginTop: 6 },

  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    color: "rgba(255,255,255,0.95)",
    fontSize: 14,
  },

  pickerWrap: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 14,
    overflow: "hidden",
  },
  picker: { color: "rgba(255,255,255,0.95)" },

  dateButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateButtonText: { color: "rgba(255,255,255,0.95)", fontSize: 14, fontWeight: "700" },

  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  value: { color: "rgba(255,255,255,0.95)", fontSize: 14, fontWeight: "800" },

  primaryBtn: {
    marginTop: 12,
    backgroundColor: "rgba(34,197,94,0.20)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "rgba(236,253,245,1)", fontWeight: "900" },

  secondaryBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    flex: 1,
  },
  secondaryBtnText: { color: "rgba(255,255,255,0.90)", fontWeight: "800" },

  dangerBtn: {
    marginTop: 10,
    backgroundColor: "rgba(248,113,113,0.14)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.30)",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  dangerBtnText: { color: "rgba(254,202,202,1)", fontWeight: "900" },

  headerBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  headerBtnText: { color: "rgba(255,255,255,0.9)", fontWeight: "800" },

  navRow: { flexDirection: "row", gap: 10, marginTop: 6 },

  stepRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  pill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  pillActive: { backgroundColor: "rgba(34,197,94,0.20)", borderWidth: 1, borderColor: "rgba(34,197,94,0.30)" },
  pillInactive: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  pillText: { color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 12 },

  billCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },

  deleteBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: "rgba(248,113,113,0.12)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  deleteBtnText: { color: "rgba(254,202,202,1)", fontWeight: "900" },

  summaryBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 16,
    padding: 12,
    gap: 6,
  },
  summaryLine: { color: "rgba(255,255,255,0.90)", fontWeight: "700" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
});
