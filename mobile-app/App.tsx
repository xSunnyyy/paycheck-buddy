// mobile-app/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  StatusBar,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/**
 * PAYCHECK BUDDY — OFFLINE ANDROID APP (Expo)
 * - Stores everything on device (AsyncStorage)
 * - User inputs: income, bills (dueDay), ONE total debt, monthly expense (single item), pay schedule
 * - Checklist remains: categories, checkboxes, per-cycle
 * - Debt auto-decreases once per cycle when "Debt Paydown" is checked
 *
 * ✅ NEW FIXES:
 * 1) Real first-time launch setup screen (gated by hasCompletedSetup)
 * 2) Schema versioning — can force a clean start when you change logic/defaults
 * 3) Defaults set to ZERO (no phantom prefilled amounts)
 */

/** -------------------- Types -------------------- */

type PayFrequency = "weekly" | "biweekly" | "twice_monthly" | "monthly";
type Category = "Bills" | "Monthly" | "Savings" | "Investing" | "Fuel" | "Debt";

type Bill = {
  id: string;
  name: string;
  amount: number;
  dueDay: number; // 1–31
};

type Settings = {
  payFrequency: PayFrequency;

  payAmount: number;
  anchorISO: string;

  twiceMonthlyDay1: number; // 1–28
  twiceMonthlyDay2: number; // 1–28
  monthlyPayDay: number; // 1–28

  bills: Bill[];

  monthlyLabel: string;
  monthlyAmount: number;

  savingsPerPay: number;
  investingPerPay: number;
  fuelPerPay: number;

  debtRemaining: number;
};

type CheckedState = Record<string, { checked: boolean; at?: string }>;

type Cycle = {
  id: string;
  label: string;
  start: Date;
  end: Date;
  payday: Date;
};

/** -------------------- Storage -------------------- */

// IMPORTANT:
// - If you ever need to force everyone to re-run setup (or wipe old restored data),
//   bump SCHEMA_VERSION by +1.
// - This also fixes "Android restored my old data after reinstall" problems in practice.
const STORAGE_KEY = "pb_mobile_v2";
const SCHEMA_VERSION = 2;

type Persisted = {
  schemaVersion: number;
  hasCompletedSetup: boolean;

  settings: Settings;
  checkedByCycle: Record<string, CheckedState>;
  appliedDebtCycles: Record<string, boolean>;
  activeCycleId?: string;
};

// ✅ Defaults set to ZERO (as you requested)
const defaultSettings = (): Settings => ({
  payFrequency: "biweekly",
  payAmount: 0,

  // anchor can be anything valid; user can change in setup/settings
  anchorISO: "2026-01-09T00:00:00-05:00",

  twiceMonthlyDay1: 1,
  twiceMonthlyDay2: 15,
  monthlyPayDay: 1,

  bills: [],

  monthlyLabel: "Rent",
  monthlyAmount: 0,

  savingsPerPay: 0,
  investingPerPay: 0,
  fuelPerPay: 0,

  debtRemaining: 0,
});

const safeParseNumber = (s: string) => {
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Math.max(0, n || 0)
  );

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** -------------------- Visual system -------------------- */

const COLORS = {
  bg: "#070A10",
  text: "rgba(244,245,247,0.95)",
  textStrong: "rgba(255,255,255,0.98)",
  muted: "rgba(185,193,204,0.82)",
  faint: "rgba(185,193,204,0.58)",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.09)",
  glassB: "rgba(255,255,255,0.045)",
  green: "rgba(34,197,94,1)",
};

const TYPE = {
  h1: { fontSize: 18, fontWeight: "900" as const },
  h2: { fontSize: 14, fontWeight: "900" as const },
  label: { fontSize: 12, fontWeight: "800" as const },
  body: { fontSize: 13, fontWeight: "600" as const },
};

/** -------------------- Schedule engine (all 4 options) -------------------- */

function cycleIdFromDate(prefix: string, d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${prefix}_${y}-${m}-${day}`;
}

function getCurrentCycle(settings: Settings, now = new Date()): Cycle {
  const n = startOfDay(now);

  if (settings.payFrequency === "weekly" || settings.payFrequency === "biweekly") {
    const msStep = settings.payFrequency === "weekly" ? 7 * 86400000 : 14 * 86400000;
    const anchor = startOfDay(new Date(settings.anchorISO));
    const t = n.getTime();
    const a = anchor.getTime();
    const idx = t < a ? 0 : Math.floor((t - a) / msStep);
    const payday = startOfDay(new Date(a + idx * msStep));
    const start = payday;
    const end = addDays(start, settings.payFrequency === "weekly" ? 6 : 13);
    const id = cycleIdFromDate(settings.payFrequency, payday);
    const label =
      settings.payFrequency === "weekly"
        ? `Week of ${formatDate(payday)}`
        : `Bi-week of ${formatDate(payday)}`;
    return { id, label, start, end, payday };
  }

  if (settings.payFrequency === "twice_monthly") {
    const d1 = clamp(settings.twiceMonthlyDay1 || 1, 1, 28);
    const d2 = clamp(settings.twiceMonthlyDay2 || 15, 1, 28);
    const dayA = Math.min(d1, d2);
    const dayB = Math.max(d1, d2);

    const year = n.getFullYear();
    const month = n.getMonth();

    const payA = startOfDay(new Date(year, month, dayA));
    const payB = startOfDay(new Date(year, month, dayB));

    let payday: Date;
    if (n.getTime() < payA.getTime()) {
      const prevMonth = new Date(year, month - 1, 1);
      payday = startOfDay(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), dayB));
    } else if (n.getTime() < payB.getTime()) {
      payday = payA;
    } else {
      payday = payB;
    }

    const start = payday;
    let nextPayday: Date;
    if (payday.getDate() === dayA) nextPayday = payB;
    else {
      const nextMonth = new Date(payday.getFullYear(), payday.getMonth() + 1, 1);
      nextPayday = startOfDay(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), dayA));
    }
    const end = addDays(nextPayday, -1);

    const id = cycleIdFromDate("twice", payday);
    const label = `Cycle starting ${formatDate(payday)}`;
    return { id, label, start, end, payday };
  }

  const day = clamp(settings.monthlyPayDay || 1, 1, 28);
  const year = n.getFullYear();
  const month = n.getMonth();
  const payThis = startOfDay(new Date(year, month, day));

  let payday: Date;
  if (n.getTime() < payThis.getTime()) {
    const prevMonth = new Date(year, month - 1, 1);
    payday = startOfDay(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), day));
  } else {
    payday = payThis;
  }

  const start = payday;
  const nextMonth = new Date(payday.getFullYear(), payday.getMonth() + 1, 1);
  const nextPayday = startOfDay(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day));
  const end = addDays(nextPayday, -1);

  const id = cycleIdFromDate("monthly", payday);
  const label = `Month cycle ${formatDate(payday)}`;
  return { id, label, start, end, payday };
}

/** -------------------- Smart bill assignment (dueDay -> cycle) -------------------- */

function billDueDateForMonth(bill: Bill, ref: Date) {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = clamp(bill.dueDay || 1, 1, lastDay);
  return startOfDay(new Date(year, month, day));
}

function isBetweenInclusive(d: Date, a: Date, b: Date) {
  const t = d.getTime();
  return t >= a.getTime() && t <= b.getTime();
}

/** -------------------- Checklist item generation -------------------- */

type ChecklistItem = {
  id: string;
  label: string;
  amount: number;
  category: Category;
  notes?: string;
};

function buildChecklistForCycle(settings: Settings, cycle: Cycle): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  for (const bill of settings.bills || []) {
    const due = billDueDateForMonth(bill, cycle.start);
    const due2 = billDueDateForMonth(bill, cycle.end);

    const inThisCycle =
      isBetweenInclusive(due, cycle.start, cycle.end) ||
      isBetweenInclusive(due2, cycle.start, cycle.end);

    if (inThisCycle) {
      items.push({
        id: `bill_${bill.id}`,
        label: `Pay ${bill.name}`,
        amount: bill.amount,
        category: "Bills",
        notes: `Due day ${bill.dueDay}`,
      });
    }
  }

  if ((settings.monthlyAmount || 0) > 0) {
    items.push({
      id: "monthly_single",
      label: `Monthly: ${settings.monthlyLabel || "Expense"}`,
      amount: settings.monthlyAmount || 0,
      category: "Monthly",
      notes: "One monthly item",
    });
  }

  if ((settings.savingsPerPay || 0) > 0) {
    items.push({
      id: "save_perpay",
      label: "Transfer to Savings",
      amount: settings.savingsPerPay || 0,
      category: "Savings",
      notes: "Repeat each pay cycle",
    });
  }

  if ((settings.investingPerPay || 0) > 0) {
    items.push({
      id: "invest_perpay",
      label: "Investing",
      amount: settings.investingPerPay || 0,
      category: "Investing",
      notes: "Repeat each pay cycle",
    });
  }

  if ((settings.fuelPerPay || 0) > 0) {
    items.push({
      id: "fuel_perpay",
      label: "Fuel / Variable Fund",
      amount: settings.fuelPerPay || 0,
      category: "Fuel",
      notes: "Repeat each pay cycle",
    });
  }

  items.push({
    id: "debt_paydown",
    label: "Debt Paydown",
    amount: 0,
    category: "Debt",
    notes: "Auto-calculated remainder",
  });

  const nonDebtTotal = items
    .filter((i) => i.id !== "debt_paydown")
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const debtPay = Math.max(0, (settings.payAmount || 0) - nonDebtTotal);

  return items.map((i) => (i.id === "debt_paydown" ? { ...i, amount: debtPay } : i));
}

function groupByCategory(items: ChecklistItem[]) {
  const map = new Map<Category, ChecklistItem[]>();
  for (const it of items) {
    const arr = map.get(it.category) ?? [];
    arr.push(it);
    map.set(it.category, arr);
  }
  return Array.from(map.entries());
}

/** -------------------- UI components -------------------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: "transparent",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          padding: 14,
          backgroundColor: COLORS.glassB,
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.10)",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Divider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: "rgba(255,255,255,0.10)",
        marginVertical: 10,
      }}
    />
  );
}

function TextBtn({
  label,
  onPress,
  kind = "default",
}: {
  label: string;
  onPress: () => void;
  kind?: "default" | "green" | "red";
}) {
  const bg =
    kind === "green"
      ? "rgba(34,197,94,0.18)"
      : kind === "red"
      ? "rgba(248,113,113,0.16)"
      : "rgba(255,255,255,0.06)";
  const br =
    kind === "green"
      ? "rgba(34,197,94,0.30)"
      : kind === "red"
      ? "rgba(248,113,113,0.30)"
      : COLORS.border;

  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: br,
        backgroundColor: bg,
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  keyboardType?: "default" | "numeric";
  placeholder?: string;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ color: COLORS.muted, ...TYPE.label }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="rgba(185,193,204,0.45)"
        style={{
          marginTop: 6,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          paddingVertical: Platform.OS === "ios" ? 12 : 10,
          paddingHorizontal: 12,
          color: COLORS.textStrong,
          backgroundColor: "rgba(255,255,255,0.05)",
          fontWeight: "800",
        }}
      />
    </View>
  );
}

/** -------------------- App -------------------- */

type Screen = "checklist" | "settings";

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

function AppInner() {
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>("checklist");

  const [loaded, setLoaded] = useState(false);

  const [hasCompletedSetup, setHasCompletedSetup] = useState(false);

  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [checkedByCycle, setCheckedByCycle] = useState<Record<string, CheckedState>>({});
  const [appliedDebtCycles, setAppliedDebtCycles] = useState<Record<string, boolean>>({});

  const cycle = useMemo(() => getCurrentCycle(settings, new Date()), [settings]);
  const activeChecked = checkedByCycle[cycle.id] ?? {};
  const items = useMemo(() => buildChecklistForCycle(settings, cycle), [settings, cycle]);
  const grouped = useMemo(() => groupByCategory(items), [items]);

  const totals = useMemo(() => {
    const planned = items.reduce((sum, i) => sum + (i.amount || 0), 0);
    const done = items.reduce(
      (sum, i) => (activeChecked[i.id]?.checked ? sum + (i.amount || 0) : sum),
      0
    );
    const itemsTotal = items.length;
    const itemsDone = items.filter((i) => activeChecked[i.id]?.checked).length;
    const pct = itemsTotal ? Math.round((itemsDone / itemsTotal) * 100) : 0;
    return { planned, done, itemsTotal, itemsDone, pct };
  }, [items, activeChecked]);

  // Load from storage on boot
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Persisted;

          // ✅ If schema changed or setup not completed, treat as "first launch"
          if (parsed?.schemaVersion === SCHEMA_VERSION && parsed?.settings) {
            setSettings(parsed.settings);
            setCheckedByCycle(parsed.checkedByCycle || {});
            setAppliedDebtCycles(parsed.appliedDebtCycles || {});
            setHasCompletedSetup(!!parsed.hasCompletedSetup);
          } else {
            // schema mismatch: wipe to defaults + require setup
            setSettings(defaultSettings());
            setCheckedByCycle({});
            setAppliedDebtCycles({});
            setHasCompletedSetup(false);
          }
        } else {
          // no storage: first launch
          setHasCompletedSetup(false);
        }
      } catch {
        setHasCompletedSetup(false);
      }
      setLoaded(true);
    })();
  }, []);

  // Save to storage whenever state changes
  useEffect(() => {
    if (!loaded) return;
    const data: Persisted = {
      schemaVersion: SCHEMA_VERSION,
      hasCompletedSetup,
      settings,
      checkedByCycle,
      appliedDebtCycles,
      activeCycleId: cycle.id,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [loaded, hasCompletedSetup, settings, checkedByCycle, appliedDebtCycles, cycle.id]);

  function toggleItem(id: string) {
    setCheckedByCycle((prev) => {
      const next = { ...prev };
      const cur = { ...(next[cycle.id] ?? {}) };
      const was = cur[id]?.checked ?? false;
      cur[id] = { checked: !was, at: !was ? new Date().toISOString() : undefined };
      next[cycle.id] = cur;
      return next;
    });
  }

  // Auto-decrease debtRemaining when debt_paydown transitions to checked (once per cycle)
  useEffect(() => {
    if (!loaded) return;
    if (!hasCompletedSetup) return;

    const debtItem = items.find((i) => i.id === "debt_paydown");
    if (!debtItem) return;

    const debtChecked = !!activeChecked["debt_paydown"]?.checked;
    const alreadyApplied = !!appliedDebtCycles[cycle.id];

    if (debtChecked && !alreadyApplied) {
      const payAmount = debtItem.amount || 0;

      setSettings((s) => ({
        ...s,
        debtRemaining: Math.max(0, (s.debtRemaining || 0) - payAmount),
      }));

      setAppliedDebtCycles((p) => ({ ...p, [cycle.id]: true }));
    }
  }, [loaded, hasCompletedSetup, activeChecked, appliedDebtCycles, cycle.id, items]);

  function resetEverything() {
    Alert.alert("Reset ALL", "This clears all saved data and returns to setup. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset ALL",
        style: "destructive",
        onPress: async () => {
          setSettings(defaultSettings());
          setCheckedByCycle({});
          setAppliedDebtCycles({});
          setHasCompletedSetup(false);
          setScreen("checklist");
          try {
            await AsyncStorage.removeItem(STORAGE_KEY);
          } catch {}
        },
      },
    ]);
  }

  // ✅ First time launch gate
  if (!loaded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
          <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasCompletedSetup) {
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
          <View style={{ paddingTop: Math.max(0, insets.top) }}>
            <Text style={{ color: COLORS.textStrong, ...TYPE.h1 }}>Welcome to Paycheck Buddy</Text>
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
              Let’s set up your pay schedule and expenses.
            </Text>
          </View>

          <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ paddingBottom: 30 }}>
            <SettingsScreen
              settings={settings}
              onChange={(s) => setSettings(s)}
              onBack={() => {}}
              mode="setup"
              onFinishSetup={() => {
                setHasCompletedSetup(true);
                setScreen("checklist");
              }}
            />

            <View style={{ marginTop: 12 }}>
              <TextBtn label="Reset ALL (start over)" onPress={resetEverything} kind="red" />
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // Normal app UI
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
        {/* Top nav */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            paddingTop: Math.max(0, insets.top),
          }}
        >
          <Text style={{ color: COLORS.textStrong, ...TYPE.h1 }}>Paycheck Buddy</Text>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <TextBtn
              label="Checklist"
              onPress={() => setScreen("checklist")}
              kind={screen === "checklist" ? "green" : "default"}
            />
            <TextBtn
              label="Settings"
              onPress={() => setScreen("settings")}
              kind={screen === "settings" ? "green" : "default"}
            />
          </View>
        </View>

        <ScrollView
          style={{ marginTop: 12 }}
          contentContainerStyle={{ paddingBottom: 30, paddingTop: 2 }}
          showsVerticalScrollIndicator={false}
        >
          {screen === "checklist" ? (
            <>
              <Card>
                <Text style={{ color: COLORS.muted, ...TYPE.body }}>
                  {cycle.label} • Payday:{" "}
                  <Text style={{ color: COLORS.textStrong }}>{formatDate(cycle.payday)}</Text>
                </Text>

                <Divider />

                <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                  Pay amount: <Text style={{ color: COLORS.textStrong }}>{fmtMoney(settings.payAmount)}</Text>
                </Text>
                <Text style={{ color: COLORS.muted, fontWeight: "700", marginTop: 6 }}>
                  Debt remaining:{" "}
                  <Text style={{ color: COLORS.textStrong }}>{fmtMoney(settings.debtRemaining)}</Text>
                </Text>

                <Divider />

                <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                  Planned: <Text style={{ color: COLORS.textStrong }}>{fmtMoney(totals.planned)}</Text>
                </Text>
                <Text style={{ color: COLORS.muted, fontWeight: "700", marginTop: 6 }}>
                  Completed: <Text style={{ color: COLORS.textStrong }}>{fmtMoney(totals.done)}</Text>
                </Text>

                <Text style={{ color: COLORS.muted, marginTop: 8, fontWeight: "700" }}>
                  Progress:{" "}
                  <Text style={{ color: COLORS.textStrong }}>
                    {totals.itemsDone}/{totals.itemsTotal} ({totals.pct}%)
                  </Text>
                </Text>

                <Divider />

                <TextBtn label="Reset ALL" onPress={resetEverything} kind="red" />
              </Card>

              <View style={{ marginTop: 12, gap: 12 }}>
                {grouped.map(([cat, catItems]) => (
                  <Card key={cat}>
                    <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>{cat}</Text>
                    <Divider />
                    <View style={{ gap: 10 }}>
                      {catItems.map((it) => {
                        const state = activeChecked[it.id];
                        const isChecked = !!state?.checked;

                        return (
                          <Pressable
                            key={it.id}
                            onPress={() => toggleItem(it.id)}
                            style={{
                              padding: 12,
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: "rgba(255,255,255,0.09)",
                              backgroundColor: isChecked
                                ? "rgba(34,197,94,0.14)"
                                : "rgba(255,255,255,0.03)",
                            }}
                          >
                            <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>
                              {isChecked ? "✅ " : "⬜ "} {it.label}
                            </Text>
                            <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                              {fmtMoney(it.amount)}
                              {it.notes ? ` • ${it.notes}` : ""}
                              {isChecked && state?.at
                                ? ` • checked ${new Date(state.at).toLocaleString()}`
                                : ""}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Card>
                ))}
              </View>

              <Text style={{ color: "rgba(185,193,204,0.58)", marginTop: 14, textAlign: "center", fontWeight: "700" }}>
                Offline • Saved on-device
              </Text>
            </>
          ) : (
            <SettingsScreen
              settings={settings}
              onChange={setSettings}
              onBack={() => setScreen("checklist")}
              mode="normal"
              onFinishSetup={() => {}}
            />
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

/** -------------------- Settings screen -------------------- */

function SettingsScreen({
  settings,
  onChange,
  onBack,
  mode,
  onFinishSetup,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
  mode: "setup" | "normal";
  onFinishSetup: () => void;
}) {
  const [local, setLocal] = useState<Settings>(settings);

  useEffect(() => setLocal(settings), [settings]);

  function save() {
    if (local.payAmount < 0) return Alert.alert("Invalid", "Pay amount must be >= 0");
    if (local.debtRemaining < 0) return Alert.alert("Invalid", "Debt remaining must be >= 0");
    if (local.twiceMonthlyDay1 < 1 || local.twiceMonthlyDay1 > 28)
      return Alert.alert("Invalid", "Twice-monthly day #1 must be 1–28");
    if (local.twiceMonthlyDay2 < 1 || local.twiceMonthlyDay2 > 28)
      return Alert.alert("Invalid", "Twice-monthly day #2 must be 1–28");
    if (local.monthlyPayDay < 1 || local.monthlyPayDay > 28)
      return Alert.alert("Invalid", "Monthly payday must be 1–28");

    onChange(local);

    if (mode === "setup") {
      Alert.alert("Saved", "Setup complete.");
      onFinishSetup();
    } else {
      Alert.alert("Saved", "Settings saved to device.");
      onBack();
    }
  }

  function setFreq(f: PayFrequency) {
    setLocal((s) => ({ ...s, payFrequency: f }));
  }

  function updateBill(billId: string, patch: Partial<Bill>) {
    setLocal((s) => ({
      ...s,
      bills: (s.bills || []).map((b) => (b.id === billId ? { ...b, ...patch } : b)),
    }));
  }

  function addBill() {
    const id = `bill_${Date.now()}`;
    setLocal((s) => ({
      ...s,
      bills: [...(s.bills || []), { id, name: "New Bill", amount: 0, dueDay: 1 }],
    }));
  }

  function removeBill(id: string) {
    setLocal((s) => ({
      ...s,
      bills: (s.bills || []).filter((b) => b.id !== id),
    }));
  }

  const freqLabel = (f: PayFrequency) => {
    if (f === "weekly") return "Weekly";
    if (f === "biweekly") return "Bi-weekly";
    if (f === "twice_monthly") return "Twice-monthly";
    return "Monthly";
  };

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Pay schedule</Text>
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
        />

        {local.payFrequency === "weekly" || local.payFrequency === "biweekly" ? (
          <>
            <Field
              label="Anchor payday (ISO date)"
              value={local.anchorISO}
              onChangeText={(s) => setLocal((p) => ({ ...p, anchorISO: s }))}
              placeholder="2026-01-09T00:00:00-05:00"
            />
            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
              Tip: set this to your first payday date. Cycles repeat from here.
            </Text>
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
            />
            <Field
              label="Twice-monthly payday #2 (1–28)"
              value={String(local.twiceMonthlyDay2)}
              onChangeText={(s) =>
                setLocal((p) => ({ ...p, twiceMonthlyDay2: clamp(safeParseNumber(s), 1, 28) }))
              }
              keyboardType="numeric"
              placeholder="15"
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
          />
        ) : null}
      </Card>

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
        />

        <Divider />

        <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Per-pay allocations</Text>

        <Field
          label="Savings per pay"
          value={String(local.savingsPerPay)}
          onChangeText={(s) => setLocal((p) => ({ ...p, savingsPerPay: safeParseNumber(s) }))}
          keyboardType="numeric"
          placeholder="0"
        />
        <Field
          label="Investing per pay"
          value={String(local.investingPerPay)}
          onChangeText={(s) => setLocal((p) => ({ ...p, investingPerPay: safeParseNumber(s) }))}
          keyboardType="numeric"
          placeholder="0"
        />
        <Field
          label="Fuel per pay"
          value={String(local.fuelPerPay)}
          onChangeText={(s) => setLocal((p) => ({ ...p, fuelPerPay: safeParseNumber(s) }))}
          keyboardType="numeric"
          placeholder="0"
        />
      </Card>

      <Card>
        <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Monthly (single checklist item)</Text>
        <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
          This still shows as ONE item in the checklist.
        </Text>

        <Divider />

        <Field
          label="Monthly label (e.g., Rent / Groceries / Other)"
          value={local.monthlyLabel}
          onChangeText={(s) => setLocal((p) => ({ ...p, monthlyLabel: s }))}
          placeholder="Rent"
        />
        <Field
          label="Monthly amount"
          value={String(local.monthlyAmount)}
          onChangeText={(s) => setLocal((p) => ({ ...p, monthlyAmount: safeParseNumber(s) }))}
          keyboardType="numeric"
          placeholder="0"
        />
      </Card>

      <Card>
        <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Bills (due day)</Text>
        <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
          Bills show up automatically in the cycle that contains their due date.
        </Text>

        <Divider />

        <View style={{ gap: 12 }}>
          {(local.bills || []).map((b) => (
            <View
              key={b.id}
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.09)",
                borderRadius: 16,
                padding: 12,
                backgroundColor: "rgba(255,255,255,0.03)",
              }}
            >
              <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Bill</Text>

              <Field label="Name" value={b.name} onChangeText={(s) => updateBill(b.id, { name: s })} />
              <Field
                label="Amount"
                value={String(b.amount)}
                onChangeText={(s) => updateBill(b.id, { amount: safeParseNumber(s) })}
                keyboardType="numeric"
              />
              <Field
                label="Due day (1–31)"
                value={String(b.dueDay)}
                onChangeText={(s) => updateBill(b.id, { dueDay: clamp(safeParseNumber(s), 1, 31) })}
                keyboardType="numeric"
              />

              <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                <TextBtn label="Remove bill" onPress={() => removeBill(b.id)} kind="red" />
              </View>
            </View>
          ))}

          <TextBtn label="Add bill" onPress={addBill} />
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <TextBtn label={mode === "setup" ? "Finish setup" : "Save settings"} onPress={save} kind="green" />
        {mode === "normal" ? <TextBtn label="Back" onPress={onBack} /> : null}
      </View>

      <Text style={{ color: "rgba(185,193,204,0.58)", marginTop: 10, textAlign: "center", fontWeight: "700" }}>
        Offline • Saved on-device
      </Text>
    </View>
  );
}
