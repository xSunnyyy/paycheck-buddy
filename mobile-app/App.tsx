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
  KeyboardAvoidingView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/**
 * PAYCHECK BUDDY — OFFLINE ANDROID APP (Expo)
 * ✅ Includes:
 * - First-time setup gate (hasCompletedSetup)
 * - New STORAGE_KEY so old data won't persist
 * - Calendar picker for anchor payday (weekly/biweekly) — DOES NOT auto-open
 * - Force date selection during setup for weekly/biweekly (blocks Finish Setup)
 * - Dynamic allocations list (add/remove pay-per items)
 * - Scroll inputs into view on focus (setup + settings)
 * - Debt auto-decreases once per cycle when "Debt Paydown" is checked
 * ✅ Added:
 * - Unexpected Expenses (per-cycle), collapsible, on Checklist screen ONLY
 * - Unexpected totals reduce the remaining pay-cycle budget, which reduces Debt Paydown
 * - Unexpected section placed at the BOTTOM of checklist screen (after all categories, incl. Debt)
 */

/** -------------------- Types -------------------- */

type PayFrequency = "weekly" | "biweekly" | "twice_monthly" | "monthly";
type Category = "Bills" | "Monthly" | "Allocations" | "Debt";

type Bill = {
  id: string;
  name: string;
  amount: number;
  dueDay: number; // 1–31
};

type Allocation = {
  id: string;
  label: string;
  amount: number;
};

type Settings = {
  payFrequency: PayFrequency;

  // Pay amount per pay event
  payAmount: number;

  // Anchor date for weekly/biweekly
  anchorISO: string; // empty until user selects during setup

  // Twice-monthly paydays
  twiceMonthlyDay1: number; // 1–28
  twiceMonthlyDay2: number; // 1–28

  // Monthly payday
  monthlyPayDay: number; // 1–28

  bills: Bill[];

  // Monthly single item
  monthlyLabel: string;
  monthlyAmount: number;

  // Dynamic per-pay allocations
  allocations: Allocation[];

  // One total debt
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

// ✅ Unexpected expense item (stored per-cycle)
type UnexpectedExpense = {
  id: string;
  label: string;
  amount: number;
  atISO: string;
};

/** -------------------- Storage -------------------- */

// ✅ NEW KEY so prior data won't carry over
const STORAGE_KEY = "pb_mobile_v4_ux";

type Persisted = {
  hasCompletedSetup: boolean;
  settings: Settings;
  checkedByCycle: Record<string, CheckedState>;
  appliedDebtCycles: Record<string, boolean>;
  activeCycleId?: string;

  // ✅ NEW
  unexpectedByCycle?: Record<string, UnexpectedExpense[]>;
};

const defaultSettings = (): Settings => ({
  payFrequency: "biweekly",
  payAmount: 0,

  // ✅ force pick during setup (weekly/biweekly)
  anchorISO: "",

  twiceMonthlyDay1: 1,
  twiceMonthlyDay2: 15,
  monthlyPayDay: 1,

  bills: [],

  monthlyLabel: "Monthly Expense",
  monthlyAmount: 0,

  // ✅ dynamic allocations start empty
  allocations: [],

  // ✅ start at 0 as requested
  debtRemaining: 0,
});

/** -------------------- Helpers -------------------- */

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
  greenSoft: "rgba(34,197,94,0.16)",
  redBorder: "rgba(248,113,113,0.55)",
};

const TYPE = {
  h1: { fontSize: 18, fontWeight: "900" as const },
  h2: { fontSize: 14, fontWeight: "900" as const },
  label: { fontSize: 12, fontWeight: "800" as const },
  body: { fontSize: 13, fontWeight: "600" as const },
};

/** -------------------- Schedule engine -------------------- */

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

    // Safety fallback (should never hit if setup was completed properly)
    const anchorISO = hasValidAnchorDate(settings.anchorISO)
      ? settings.anchorISO
      : new Date().toISOString();

    const anchor = startOfDay(new Date(anchorISO));
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

/** -------------------- Bills due date -> cycle assignment -------------------- */

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

/** -------------------- Checklist items -------------------- */

type ChecklistItem = {
  id: string;
  label: string;
  amount: number;
  category: Category;
  notes?: string;
};

function buildChecklistForCycle(
  settings: Settings,
  cycle: Cycle,
  unexpectedTotal: number = 0
): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  // Bills included if due date falls in cycle range
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

  // Monthly single item
  if ((settings.monthlyAmount || 0) > 0) {
    items.push({
      id: "monthly_single",
      label: `Monthly: ${settings.monthlyLabel || "Expense"}`,
      amount: settings.monthlyAmount || 0,
      category: "Monthly",
      notes: "One monthly item",
    });
  }

  // Dynamic allocations
  for (const a of settings.allocations || []) {
    const amt = a.amount || 0;
    if (amt > 0) {
      items.push({
        id: `alloc_${a.id}`,
        label: a.label || "Allocation",
        amount: amt,
        category: "Allocations",
        notes: "Repeat each pay cycle",
      });
    }
  }

  // Debt remainder
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

  // ✅ subtract unexpected expenses from remainder
  const debtPay = Math.max(0, (settings.payAmount || 0) - nonDebtTotal - (unexpectedTotal || 0));

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

/** -------------------- UI Components -------------------- */

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

function TextBtn({
  label,
  onPress,
  kind = "default",
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: "default" | "green" | "red";
  disabled?: boolean;
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
      disabled={disabled}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: br,
        backgroundColor: bg,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Field that:
 * - captures its Y position via onLayout
 * - scrolls to itself when focused (so typing is visible)
 */
function Field({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  placeholder,
  onFocusScrollToY,
  borderColorOverride,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  keyboardType?: "default" | "numeric";
  placeholder?: string;
  onFocusScrollToY?: (y: number) => void;
  borderColorOverride?: string;
}) {
  const yRef = useRef<number>(0);

  return (
    <View
      style={{ marginTop: 10 }}
      onLayout={(e) => {
        yRef.current = e.nativeEvent.layout.y;
      }}
    >
      <Text style={{ color: COLORS.muted, ...TYPE.label }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="rgba(185,193,204,0.45)"
        onFocus={() => {
          // scroll a bit above the field so it isn't under the keyboard
          if (onFocusScrollToY) onFocusScrollToY(Math.max(0, yRef.current - 20));
        }}
        style={{
          marginTop: 6,
          borderWidth: 1,
          borderColor: borderColorOverride ?? COLORS.border,
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

  // ✅ Unexpected per-cycle storage
  const [unexpectedByCycle, setUnexpectedByCycle] = useState<
    Record<string, UnexpectedExpense[]>
  >({});

  // ✅ Unexpected UI state (Checklist screen only)
  const [unexpectedOpen, setUnexpectedOpen] = useState(false);
  const [uxLabel, setUxLabel] = useState("");
  const [uxAmount, setUxAmount] = useState("");

  const cycle = useMemo(() => getCurrentCycle(settings, new Date()), [settings]);
  const activeChecked = checkedByCycle[cycle.id] ?? {};

  const unexpected = unexpectedByCycle[cycle.id] ?? [];
  const unexpectedTotal = useMemo(
    () => unexpected.reduce((sum, x) => sum + (x.amount || 0), 0),
    [unexpected]
  );

  const items = useMemo(
    () => buildChecklistForCycle(settings, cycle, unexpectedTotal),
    [settings, cycle, unexpectedTotal]
  );
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

  function addUnexpected() {
    const amt = safeParseNumber(uxAmount);
    if (amt <= 0) return;

    const item: UnexpectedExpense = {
      id: `ux_${Date.now()}`,
      label: (uxLabel || "Unexpected expense").trim(),
      amount: amt,
      atISO: new Date().toISOString(),
    };

    setUnexpectedByCycle((prev) => {
      const next = { ...prev };
      const arr = [...(next[cycle.id] ?? [])];
      arr.unshift(item);
      next[cycle.id] = arr;
      return next;
    });

    setUxLabel("");
    setUxAmount("");

    // ✅ close after adding (as requested: user must open manually)
    setUnexpectedOpen(false);
  }

  function removeUnexpected(id: string) {
    setUnexpectedByCycle((prev) => {
      const next = { ...prev };
      next[cycle.id] = (next[cycle.id] ?? []).filter((x) => x.id !== id);
      return next;
    });
  }

  // Load from storage
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Persisted;
          if (parsed?.settings) setSettings(parsed.settings);
          if (parsed?.checkedByCycle) setCheckedByCycle(parsed.checkedByCycle);
          if (parsed?.appliedDebtCycles) setAppliedDebtCycles(parsed.appliedDebtCycles);
          if (parsed?.unexpectedByCycle) setUnexpectedByCycle(parsed.unexpectedByCycle);
          setHasCompletedSetup(!!parsed?.hasCompletedSetup);
        } else {
          setHasCompletedSetup(false);
        }
      } catch {
        setHasCompletedSetup(false);
      }
      setLoaded(true);
    })();
  }, []);

  // Save to storage
  useEffect(() => {
    if (!loaded) return;
    const data: Persisted = {
      hasCompletedSetup,
      settings,
      checkedByCycle,
      appliedDebtCycles,
      activeCycleId: cycle.id,
      unexpectedByCycle,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [
    loaded,
    hasCompletedSetup,
    settings,
    checkedByCycle,
    appliedDebtCycles,
    unexpectedByCycle,
    cycle.id,
  ]);

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

  // Debt auto-decrease when debt_paydown is checked, once per cycle
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
          const fresh = defaultSettings();
          setSettings(fresh);
          setCheckedByCycle({});
          setAppliedDebtCycles({});
          setUnexpectedByCycle({});
          setHasCompletedSetup(false);
          setScreen("checklist");
          try {
            await AsyncStorage.removeItem(STORAGE_KEY);
          } catch {}
        },
      },
    ]);
  }

  if (!loaded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Setup gate
  if (!hasCompletedSetup) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
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
            <View style={{ paddingTop: Math.max(0, insets.top) }}>
              <Text style={{ color: COLORS.textStrong, ...TYPE.h1 }}>Welcome to Paycheck Buddy</Text>
              <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                Let’s set up your pay schedule and expenses.
              </Text>
            </View>

            <ScrollView
              style={{ marginTop: 12 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 30 }}
              showsVerticalScrollIndicator={false}
            >
              <SettingsScreen
                mode="setup"
                settings={settings}
                onChange={setSettings}
                onBack={() => {}}
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
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Normal app UI
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 30, paddingTop: 2 }}
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
                      <Text style={{ color: COLORS.muted, ...TYPE.label }}>Unexpected (this cycle)</Text>
                      <Chip>{fmtMoney(unexpectedTotal)}</Chip>
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

                  <TextBtn label="Reset ALL" onPress={resetEverything} kind="red" />
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
                                  backgroundColor: isChecked ? COLORS.greenSoft : "rgba(255,255,255,0.03)",
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

                {/* ✅ Unexpected Expense at the BOTTOM (after Debt/category cards) */}
                <View style={{ marginTop: 12 }}>
                  <Card>
                    <Pressable
                      onPress={() => setUnexpectedOpen((v) => !v)}
                      style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Unexpected Expense</Text>
                        <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                          Tap to {unexpectedOpen ? "close" : "open"} • This cycle:{" "}
                          <Text style={{ color: COLORS.textStrong }}>{fmtMoney(unexpectedTotal)}</Text>
                        </Text>
                      </View>

                      <Text style={{ color: COLORS.textStrong, fontWeight: "900", fontSize: 18 }}>
                        {unexpectedOpen ? "▾" : "▸"}
                      </Text>
                    </Pressable>

                    {unexpectedOpen ? (
                      <>
                        <Divider />

                        <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                          Add a one-off cost for this pay cycle. It reduces what you can pay toward debt automatically.
                        </Text>

                        <View style={{ marginTop: 10 }}>
                          <Text style={{ color: COLORS.muted, ...TYPE.label }}>Label</Text>
                          <TextInput
                            value={uxLabel}
                            onChangeText={setUxLabel}
                            placeholder="Car repair"
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

                        <View style={{ marginTop: 10 }}>
                          <Text style={{ color: COLORS.muted, ...TYPE.label }}>Amount</Text>
                          <TextInput
                            value={uxAmount}
                            onChangeText={setUxAmount}
                            keyboardType="numeric"
                            placeholder="0"
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

                        <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                          <TextBtn
                            label="Add unexpected expense"
                            onPress={addUnexpected}
                            kind="green"
                            disabled={safeParseNumber(uxAmount) <= 0}
                          />
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
                                    borderColor: COLORS.borderSoft,
                                    backgroundColor: "rgba(255,255,255,0.03)",
                                  }}
                                >
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      gap: 10,
                                    }}
                                  >
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>
                                        {x.label}
                                      </Text>
                                      <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                                        {fmtMoney(x.amount)} • {new Date(x.atISO).toLocaleString()}
                                      </Text>
                                    </View>

                                    <View style={{ alignItems: "flex-end", gap: 8 }}>
                                      <Chip>{fmtMoney(x.amount)}</Chip>
                                      <TextBtn label="Remove" onPress={() => removeUnexpected(x.id)} kind="red" />
                                    </View>
                                  </View>
                                </View>
                              ))}
                            </View>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </Card>
                </View>

                <Text style={{ color: COLORS.faint, marginTop: 14, textAlign: "center", fontWeight: "700" }}>
                  Offline • Saved on-device
                </Text>
              </>
            ) : (
              <SettingsScreen
                mode="normal"
                settings={settings}
                onChange={setSettings}
                onBack={() => setScreen("checklist")}
                onFinishSetup={() => {}}
              />
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** -------------------- Settings Screen -------------------- */

function SettingsScreen({
  mode,
  settings,
  onChange,
  onBack,
  onFinishSetup,
}: {
  mode: "setup" | "normal";
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
  onFinishSetup: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);

  const [local, setLocal] = useState<Settings>(settings);

  const [showAnchorPicker, setShowAnchorPicker] = useState(false);
  const [anchorError, setAnchorError] = useState(false);

  useEffect(() => setLocal(settings), [settings]);

  const onFocusScrollToY = (y: number) => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y, animated: true });
    }, 60);
  };

  function save() {
    // Force anchor selection in setup for weekly/biweekly
    if (
      (local.payFrequency === "weekly" || local.payFrequency === "biweekly") &&
      !hasValidAnchorDate(local.anchorISO)
    ) {
      if (mode === "setup") {
        setAnchorError(true);
        Alert.alert("Select a payday", "Please choose your first payday to finish setup.");
        return;
      }
    }

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
    if (!(f === "weekly" || f === "biweekly")) setAnchorError(false);
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

  function addAllocation() {
    const id = `alloc_${Date.now()}`;
    setLocal((s) => ({
      ...s,
      allocations: [...(s.allocations || []), { id, label: "New Allocation", amount: 0 }],
    }));
  }

  function updateAllocation(id: string, patch: Partial<Allocation>) {
    setLocal((s) => ({
      ...s,
      allocations: (s.allocations || []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }

  function removeAllocation(id: string) {
    setLocal((s) => ({
      ...s,
      allocations: (s.allocations || []).filter((a) => a.id !== id),
    }));
  }

  const freqLabel = (f: PayFrequency) => {
    if (f === "weekly") return "Weekly";
    if (f === "biweekly") return "Bi-weekly";
    if (f === "twice_monthly") return "Twice-monthly";
    return "Monthly";
  };

  const shouldShowAnchor = local.payFrequency === "weekly" || local.payFrequency === "biweekly";
  const anchorSelected = hasValidAnchorDate(local.anchorISO);

  return (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 30 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ gap: 12 }}>
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
            onFocusScrollToY={onFocusScrollToY}
          />

          {/* ✅ Anchor payday calendar (no auto-open) */}
          {shouldShowAnchor ? (
            <>
              <Text style={{ color: COLORS.muted, ...TYPE.label, marginTop: 10 }}>
                Anchor payday
              </Text>

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
                <Text
                  style={{
                    color: anchorSelected ? COLORS.textStrong : COLORS.faint,
                    fontWeight: "800",
                  }}
                >
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
                    // Android closes on selection/cancel
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
                onFocusScrollToY={onFocusScrollToY}
              />
              <Field
                label="Twice-monthly payday #2 (1–28)"
                value={String(local.twiceMonthlyDay2)}
                onChangeText={(s) =>
                  setLocal((p) => ({ ...p, twiceMonthlyDay2: clamp(safeParseNumber(s), 1, 28) }))
                }
                keyboardType="numeric"
                placeholder="15"
                onFocusScrollToY={onFocusScrollToY}
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
              onFocusScrollToY={onFocusScrollToY}
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
            onFocusScrollToY={onFocusScrollToY}
          />
        </Card>

        {/* ✅ Dynamic allocations */}
        <Card>
          <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Pay-per allocations</Text>
          <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
            Add or remove items that repeat every pay cycle (e.g., Savings, Investing, Fuel).
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
                <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>Allocation</Text>

                <Field
                  label="Label"
                  value={a.label}
                  onChangeText={(s) => updateAllocation(a.id, { label: s })}
                  placeholder="Savings"
                  onFocusScrollToY={onFocusScrollToY}
                />
                <Field
                  label="Amount"
                  value={String(a.amount)}
                  onChangeText={(s) => updateAllocation(a.id, { amount: safeParseNumber(s) })}
                  keyboardType="numeric"
                  placeholder="0"
                  onFocusScrollToY={onFocusScrollToY}
                />

                <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                  <TextBtn label="Remove allocation" onPress={() => removeAllocation(a.id)} kind="red" />
                </View>
              </View>
            ))}

            <TextBtn label="Add allocation" onPress={addAllocation} />
          </View>
        </Card>

        <Card>
          <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Monthly (single checklist item)</Text>
          <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
            Still shows as ONE item in the checklist.
          </Text>

          <Divider />

          <Field
            label="Monthly label (e.g., Rent / Groceries / Other)"
            value={local.monthlyLabel}
            onChangeText={(s) => setLocal((p) => ({ ...p, monthlyLabel: s }))}
            placeholder="Monthly Expense"
            onFocusScrollToY={onFocusScrollToY}
          />
          <Field
            label="Monthly amount"
            value={String(local.monthlyAmount)}
            onChangeText={(s) => setLocal((p) => ({ ...p, monthlyAmount: safeParseNumber(s) }))}
            keyboardType="numeric"
            placeholder="0"
            onFocusScrollToY={onFocusScrollToY}
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

                <Field
                  label="Name"
                  value={b.name}
                  onChangeText={(s) => updateBill(b.id, { name: s })}
                  placeholder="Verizon"
                  onFocusScrollToY={onFocusScrollToY}
                />
                <Field
                  label="Amount"
                  value={String(b.amount)}
                  onChangeText={(s) => updateBill(b.id, { amount: safeParseNumber(s) })}
                  keyboardType="numeric"
                  placeholder="0"
                  onFocusScrollToY={onFocusScrollToY}
                />
                <Field
                  label="Due day (1–31)"
                  value={String(b.dueDay)}
                  onChangeText={(s) => updateBill(b.id, { dueDay: clamp(safeParseNumber(s), 1, 31) })}
                  keyboardType="numeric"
                  placeholder="1"
                  onFocusScrollToY={onFocusScrollToY}
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
          <TextBtn
            label={mode === "setup" ? "Finish setup" : "Save settings"}
            onPress={save}
            kind="green"
          />
          {mode === "normal" ? <TextBtn label="Back" onPress={onBack} /> : null}
        </View>

        <Text style={{ color: COLORS.faint, marginTop: 10, textAlign: "center", fontWeight: "700" }}>
          Offline • Saved on-device
        </Text>
      </View>
    </ScrollView>
  );
}
