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
 * ✅ FIXES APPLIED:
 * 1) Proper Safe Area handling for Android (Fold devices) using react-native-safe-area-context
 * 2) Header padding respects top inset so it won't be cut off by the status bar
 * 3) StatusBar set to translucent with transparent background
 * 4) ScrollView content includes extra top padding so content doesn't clip
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

  // Pay amount per pay event:
  // - weekly: payAmount = weekly paycheck
  // - biweekly: payAmount = bi-weekly paycheck
  // - twice-monthly: payAmount = each paycheck amount
  // - monthly: payAmount = monthly income amount (single pay event)
  payAmount: number;

  // Anchor date used for weekly/biweekly schedule (first payday)
  // For twice-monthly/monthly we use day-of-month settings instead
  anchorISO: string; // ISO date string

  // Twice-monthly paydays (e.g., 1st and 15th)
  twiceMonthlyDay1: number; // 1–28
  twiceMonthlyDay2: number; // 1–28

  // Monthly payday (e.g., 1st)
  monthlyPayDay: number; // 1–28

  // Bills
  bills: Bill[];

  // Monthly expense (single item)
  monthlyLabel: string; // e.g. "Rent" / "Groceries" / "Other"
  monthlyAmount: number;

  // Per-pay allocations (repeat each pay event)
  savingsPerPay: number;
  investingPerPay: number;
  fuelPerPay: number;

  // Total debt (one number)
  debtRemaining: number;
};

type CheckedState = Record<string, { checked: boolean; at?: string }>;

type Cycle = {
  id: string; // stable id for this cycle (used to avoid double-subtract debt)
  label: string; // display label
  start: Date;
  end: Date;
  payday: Date; // "cycle payday" for display
};

/** -------------------- Storage -------------------- */

const STORAGE_KEY = "pb_mobile_v1";

type Persisted = {
  settings: Settings;
  checkedByCycle: Record<string, CheckedState>; // cycleId -> checked state
  appliedDebtCycles: Record<string, boolean>; // cycleId -> debt applied?
  activeCycleId?: string;
};

const defaultSettings = (): Settings => ({
  payFrequency: "biweekly",
  payAmount: 3313,
  // default anchor: Jan 9, 2026 (matching your web app)
  anchorISO: "2026-01-09T00:00:00-05:00",
  twiceMonthlyDay1: 1,
  twiceMonthlyDay2: 15,
  monthlyPayDay: 1,

  bills: [
    { id: "bill_tmobile", name: "T-Mobile", amount: 95, dueDay: 2 },
    { id: "bill_verizon", name: "Verizon", amount: 95, dueDay: 25 },
    { id: "bill_statefarm", name: "State Farm", amount: 270, dueDay: 16 },
  ],

  monthlyLabel: "Rent",
  monthlyAmount: 0,

  savingsPerPay: 500,
  investingPerPay: 200,
  fuelPerPay: 500,

  debtRemaining: 33300,
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
  glassA: "rgba(255,255,255,0.085)",
  glassB: "rgba(255,255,255,0.045)",
  glassC: "rgba(255,255,255,0.03)",
  green: "rgba(34,197,94,1)",
  greenSoft: "rgba(34,197,94,0.16)",
  redSoft: "rgba(248,113,113,0.14)",
};

const TYPE = {
  h1: { fontSize: 18, fontWeight: "900" as const },
  h2: { fontSize: 14, fontWeight: "900" as const },
  label: { fontSize: 12, fontWeight: "800" as const },
  valueLg: { fontSize: 22, fontWeight: "900" as const },
  valueMd: { fontSize: 16, fontWeight: "900" as const },
  body: { fontSize: 13, fontWeight: "600" as const },
};

/** -------------------- Schedule engine (all 4 options) -------------------- */

/**
 * We compute a "current cycle" based on pay frequency.
 * - weekly: cycles are 7 days anchored by anchorISO
 * - biweekly: cycles are 14 days anchored by anchorISO
 * - twice-monthly: cycles based on two days-of-month (d1, d2)
 * - monthly: cycles based on one day-of-month
 *
 * Each cycle gets a stable ID so we can avoid re-applying debt reduction.
 */

function cycleIdFromDate(prefix: string, d: Date) {
  // stable YYYY-MM-DD
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
    const start = payday; // cycle starts on payday
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

    // Determine most recent payday (A or B) not after today
    let payday: Date;
    if (n.getTime() < payA.getTime()) {
      // go to previous month B
      const prevMonth = new Date(year, month - 1, 1);
      payday = startOfDay(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), dayB));
    } else if (n.getTime() < payB.getTime()) {
      payday = payA;
    } else {
      payday = payB;
    }

    const start = payday;
    // end = day before next payday
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

  // monthly
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

/**
 * For the CURRENT cycle, a bill belongs to this cycle if:
 * - its due date for the month falls within cycle.start..cycle.end
 *
 * This works for weekly/biweekly too.
 */
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

  // Bills: include bills whose due date in the active cycle range
  for (const bill of settings.bills || []) {
    const due = billDueDateForMonth(bill, cycle.start);
    // if cycle crosses months, check due date for both months
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

  // Monthly: single item that can represent any monthly expense type
  if ((settings.monthlyAmount || 0) > 0) {
    items.push({
      id: "monthly_single",
      label: `Monthly: ${settings.monthlyLabel || "Expense"}`,
      amount: settings.monthlyAmount || 0,
      category: "Monthly",
      notes: "One monthly item",
    });
  }

  // Per-pay repeats
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

  // Debt item is auto-calculated as remainder
  items.push({
    id: "debt_paydown",
    label: "Debt Paydown",
    amount: 0, // computed later
    category: "Debt",
    notes: "Auto-calculated remainder",
  });

  // Calculate debt paydown = payAmount - everything else
  const nonDebtTotal = items
    .filter((i) => i.id !== "debt_paydown")
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const debtPay = Math.max(0, (settings.payAmount || 0) - nonDebtTotal);

  // Put computed amount
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.borderSoft,
        backgroundColor: "rgba(255,255,255,0.06)",
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: "800" }}>{children}</Text>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginVertical: 10 }} />;
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
  const [settings, setSettings] = useState<Settings>(defaultSettings());

  const [checkedByCycle, setCheckedByCycle] = useState<Record<string, CheckedState>>({});
  const [appliedDebtCycles, setAppliedDebtCycles] = useState<Record<string, boolean>>({});

  const cycle = useMemo(() => getCurrentCycle(settings, new Date()), [settings]);
  const activeChecked = checkedByCycle[cycle.id] ?? {};

  const items = useMemo(() => buildChecklistForCycle(settings, cycle), [settings, cycle]);
  const grouped = useMemo(() => groupByCategory(items), [items]);

  const totals = useMemo(() => {
    const planned = items.reduce((sum, i) => sum + (i.amount || 0), 0);
    const done = items.reduce((sum, i) => (activeChecked[i.id]?.checked ? sum + (i.amount || 0) : sum), 0);
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
          if (parsed?.settings) setSettings(parsed.settings);
          if (parsed?.checkedByCycle) setCheckedByCycle(parsed.checkedByCycle);
          if (parsed?.appliedDebtCycles) setAppliedDebtCycles(parsed.appliedDebtCycles);
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // Save to storage whenever state changes
  useEffect(() => {
    if (!loaded) return;
    const data: Persisted = {
      settings,
      checkedByCycle,
      appliedDebtCycles,
      activeCycleId: cycle.id,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [loaded, settings, checkedByCycle, appliedDebtCycles, cycle.id]);

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
  const lastDebtAppliedRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!loaded) return;

    const debtItem = items.find((i) => i.id === "debt_paydown");
    if (!debtItem) return;

    const debtChecked = !!activeChecked["debt_paydown"]?.checked;
    const alreadyApplied = !!appliedDebtCycles[cycle.id];

    // We only apply if checked and not applied yet
    if (debtChecked && !alreadyApplied) {
      const payAmount = debtItem.amount || 0;

      setSettings((s) => ({
        ...s,
        debtRemaining: Math.max(0, (s.debtRemaining || 0) - payAmount),
      }));

      setAppliedDebtCycles((p) => ({ ...p, [cycle.id]: true }));
    }

    // If user unchecks later, we do NOT auto-add it back (to avoid complexity).
    // If you want "undo" later, we can implement it.
  }, [loaded, activeChecked, appliedDebtCycles, cycle.id, items]);

  function resetThisCycle() {
    Alert.alert("Reset", "Reset this cycle checklist?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          setCheckedByCycle((prev) => {
            const next = { ...prev };
            next[cycle.id] = {};
            return next;
          });
          // We do NOT reset appliedDebtCycles automatically.
          // If you reset after applying debt, you would otherwise double-apply later.
        },
      },
    ]);
  }

  function resetEverything() {
    Alert.alert("Reset ALL", "This clears all saved data and restores defaults. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset ALL",
        style: "destructive",
        onPress: async () => {
          const fresh = defaultSettings();
          setSettings(fresh);
          setCheckedByCycle({});
          setAppliedDebtCycles({});
          try {
            await AsyncStorage.removeItem(STORAGE_KEY);
          } catch {}
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      {/* ✅ Prevent content under status bar (Fold fix) */}
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          // ✅ header + content now respects the top inset
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
            // ✅ add inset so "Paycheck Buddy" never clips on Fold status bar
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
          contentContainerStyle={{
            paddingBottom: 30,
            // ✅ a little breathing room under the header on devices with big insets
            paddingTop: 2,
          }}
          showsVerticalScrollIndicator={false}
        >
          {screen === "checklist" ? (
            <>
              {/* Summary */}
              <Card>
                <Text style={{ color: COLORS.muted, ...TYPE.body }}>
                  {cycle.label} • Payday:{" "}
                  <Text style={{ color: COLORS.textStrong }}>{formatDate(cycle.payday)}</Text>
                </Text>

                <Divider />

                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: COLORS.muted, ...TYPE.label }}>Pay amount</Text>
                    <Chip>{fmtMoney(settings.payAmount)}</Chip>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: COLORS.muted, ...TYPE.label }}>Debt remaining</Text>
                    <Chip>{fmtMoney(settings.debtRemaining)}</Chip>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: COLORS.muted, ...TYPE.label }}>Planned</Text>
                    <Chip>{fmtMoney(totals.planned)}</Chip>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: COLORS.muted, ...TYPE.label }}>Completed</Text>
                    <Chip>{fmtMoney(totals.done)}</Chip>
                  </View>

                  <Text style={{ color: COLORS.muted, ...TYPE.body }}>
                    Progress:{" "}
                    <Text style={{ color: COLORS.textStrong }}>
                      {totals.itemsDone}/{totals.itemsTotal} ({totals.pct}%)
                    </Text>
                  </Text>
                </View>

                <Divider />

                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  <TextBtn label="Reset this cycle" onPress={resetThisCycle} />
                  <TextBtn label="Reset ALL" onPress={resetEverything} kind="red" />
                </View>
              </Card>

              {/* Checklist */}
              <View style={{ marginTop: 12, gap: 12 }}>
                {grouped.map(([cat, catItems]) => {
                  const plannedForCat = catItems.reduce((sum, i) => sum + (i.amount || 0), 0);
                  return (
                    <Card key={cat}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>{cat}</Text>
                        <Chip>{fmtMoney(plannedForCat)} planned</Chip>
                      </View>

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
                                borderColor: COLORS.borderSoft,
                                backgroundColor: isChecked ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.03)",
                              }}
                            >
                              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                                <View style={{ flex: 1 }}>
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
                                </View>
                                <Chip>{fmtMoney(it.amount)}</Chip>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Card>
                  );
                })}
              </View>

              <Text style={{ color: COLORS.faint, marginTop: 14, textAlign: "center", fontWeight: "700" }}>
                Offline • Saved on-device
              </Text>
            </>
          ) : (
            <SettingsScreen settings={settings} onChange={setSettings} onBack={() => setScreen("checklist")} />
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
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
}) {
  const [local, setLocal] = useState<Settings>(settings);

  useEffect(() => setLocal(settings), [settings]);

  function save() {
    // Basic validation
    if (local.payAmount < 0) {
      Alert.alert("Invalid", "Pay amount must be >= 0");
      return;
    }
    if (local.debtRemaining < 0) {
      Alert.alert("Invalid", "Debt remaining must be >= 0");
      return;
    }
    if (local.twiceMonthlyDay1 < 1 || local.twiceMonthlyDay1 > 28) {
      Alert.alert("Invalid", "Twice-monthly day #1 must be 1–28");
      return;
    }
    if (local.twiceMonthlyDay2 < 1 || local.twiceMonthlyDay2 > 28) {
      Alert.alert("Invalid", "Twice-monthly day #2 must be 1–28");
      return;
    }
    if (local.monthlyPayDay < 1 || local.monthlyPayDay > 28) {
      Alert.alert("Invalid", "Monthly payday must be 1–28");
      return;
    }

    onChange(local);
    Alert.alert("Saved", "Settings saved to device.");
    onBack();
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
          placeholder="3313"
        />

        {local.payFrequency === "weekly" || local.payFrequency === "biweekly" ? (
          <>
            <Field
              label="Anchor payday (ISO date)"
              value={local.anchorISO}
              onChangeText={(s) => setLocal((p) => ({ ...p, anchorISO: s }))}
              placeholder="2026-01-09T00:00:00-05:00"
            />
            <Text style={{ color: COLORS.faint, marginTop: 6, fontWeight: "700" }}>
              Tip: keep this as your first payday date. Cycles repeat from here.
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
          <>
            <Field
              label="Monthly payday (1–28)"
              value={String(local.monthlyPayDay)}
              onChangeText={(s) =>
                setLocal((p) => ({ ...p, monthlyPayDay: clamp(safeParseNumber(s), 1, 28) }))
              }
              keyboardType="numeric"
              placeholder="1"
            />
          </>
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
          placeholder="33300"
        />

        <Divider />

        <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Per-pay allocations</Text>

        <Field
          label="Savings per pay"
          value={String(local.savingsPerPay)}
          onChangeText={(s) => setLocal((p) => ({ ...p, savingsPerPay: safeParseNumber(s) }))}
          keyboardType="numeric"
          placeholder="500"
        />
        <Field
          label="Investing per pay"
          value={String(local.investingPerPay)}
          onChangeText={(s) => setLocal((p) => ({ ...p, investingPerPay: safeParseNumber(s) }))}
          keyboardType="numeric"
          placeholder="200"
        />
        <Field
          label="Fuel per pay"
          value={String(local.fuelPerPay)}
          onChangeText={(s) => setLocal((p) => ({ ...p, fuelPerPay: safeParseNumber(s) }))}
          keyboardType="numeric"
          placeholder="500"
        />
      </Card>

      <Card>
        <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Monthly (single checklist item)</Text>
        <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
          Select what “Monthly” represents. It still shows as ONE item in the checklist.
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
                borderColor: COLORS.borderSoft,
                borderRadius: 16,
                padding: 12,
                backgroundColor: "rgba(255,255,255,0.03)",
              }}
            >
              <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Bill</Text>

              <Field label="Name" value={b.name} onChangeText={(s) => updateBill(b.id, { name: s })} placeholder="Verizon" />
              <Field
                label="Amount"
                value={String(b.amount)}
                onChangeText={(s) => updateBill(b.id, { amount: safeParseNumber(s) })}
                keyboardType="numeric"
                placeholder="95"
              />
              <Field
                label="Due day (1–31)"
                value={String(b.dueDay)}
                onChangeText={(s) => updateBill(b.id, { dueDay: clamp(safeParseNumber(s), 1, 31) })}
                keyboardType="numeric"
                placeholder="25"
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
        <TextBtn label="Save settings" onPress={save} kind="green" />
        <TextBtn label="Back" onPress={onBack} />
      </View>

      <Text style={{ color: COLORS.faint, marginTop: 10, textAlign: "center", fontWeight: "700" }}>
        Offline • Saved on-device
      </Text>
    </View>
  );
}
