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
  findNodeHandle,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/**
 * PAYFLOW — OFFLINE ANDROID APP (Expo)
 * ✅ Includes:
 * - First-time setup gate (hasCompletedSetup)
 * - Payday (weekly/biweekly anchor)
 * - Paycheck Distributions (per-pay)
 * - Personal Spending (per-pay)
 * - Monthly Expenses list (multiple) with dueDay + cycle assignment like bills
 * - Scroll focused inputs above keyboard (Settings + Dashboard + Unexpected)
 * - Debt auto-decreases once per cycle when "Debt Paydown" is checked
 * - Unexpected Expenses per-cycle (collapsible) on dashboard
 * - History: last 10 cycles + detail view
 * - Cycle navigation: Prev / This / Next
 *
 * ✅ UX:
 * - Due day input allows deleting/typing (no forced "1")
 * - New Bill/Monthly/Distribution/Personal start with EMPTY name
 * - Top nav centered: Dashboard / History / Settings
 *
 * ✅ Requested changes:
 * - App name shown in setup renamed to PayFlow
 * - Remove "Reset ALL" from Dashboard summary (keep only in Settings bottom)
 */

/** -------------------- Types -------------------- */

type PayFrequency = "weekly" | "biweekly" | "twice_monthly" | "monthly";
type Category = "Bills" | "Monthly" | "Allocations" | "Personal" | "Debt";

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

type PersonalSpendingItem = {
  id: string;
  label: string;
  amount: number;
};

type MonthlyItem = {
  id: string;
  label: string;
  amount: number;
  dueDay: number; // 1–31
};

type Settings = {
  payFrequency: PayFrequency;
  payAmount: number;

  // weekly/biweekly payday (anchor)
  anchorISO: string;

  twiceMonthlyDay1: number; // 1–28
  twiceMonthlyDay2: number; // 1–28
  monthlyPayDay: number; // 1–28

  bills: Bill[];
  monthlyItems: MonthlyItem[];

  allocations: Allocation[];
  personalSpending: PersonalSpendingItem[];

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

type UnexpectedExpense = {
  id: string;
  label: string;
  amount: number;
  atISO: string;
};

/** -------------------- Storage -------------------- */

const STORAGE_KEY = "payflow_mobile_v1";

type Persisted = {
  hasCompletedSetup: boolean;
  settings: any; // migration-friendly
  checkedByCycle: Record<string, CheckedState>;
  appliedDebtCycles: Record<string, boolean>;
  activeCycleId?: string;
  unexpectedByCycle?: Record<string, UnexpectedExpense[]>;
};

const defaultSettings = (): Settings => ({
  payFrequency: "biweekly",
  payAmount: 0,
  anchorISO: "",
  twiceMonthlyDay1: 1,
  twiceMonthlyDay2: 15,
  monthlyPayDay: 1,
  bills: [],
  monthlyItems: [],
  allocations: [],
  personalSpending: [],
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
  amberSoft: "rgba(251,191,36,0.15)",
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

function getCycleWithOffset(settings: Settings, now: Date, offset: number): Cycle {
  let c = getCurrentCycle(settings, now);
  if (offset === 0) return c;

  if (offset > 0) {
    for (let i = 0; i < offset; i++) {
      const probe = addDays(c.end, 1);
      c = getCurrentCycle(settings, probe);
    }
    return c;
  }

  for (let i = 0; i < Math.abs(offset); i++) {
    const probe = addDays(c.start, -1);
    c = getCurrentCycle(settings, probe);
  }
  return c;
}

function getLastNCycles(settings: Settings, now: Date, n: number): Cycle[] {
  const cycles: Cycle[] = [];
  const seen = new Set<string>();

  let cur = getCurrentCycle(settings, now);
  while (cycles.length < n && !seen.has(cur.id)) {
    cycles.push(cur);
    seen.add(cur.id);

    const probe = addDays(cur.start, -1);
    cur = getCurrentCycle(settings, probe);

    if (cycles.length > n + 5) break;
  }

  return cycles;
}

/** -------------------- Due date helpers -------------------- */

function dueDateForMonth(dueDay: number, ref: Date) {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = clamp(dueDay || 1, 1, lastDay);
  return startOfDay(new Date(year, month, day));
}

function isBetweenInclusive(d: Date, a: Date, b: Date) {
  const t = d.getTime();
  return t >= a.getTime() && t <= b.getTime();
}

/** -------------------- Dashboard items -------------------- */

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

  for (const bill of settings.bills || []) {
    const dueA = dueDateForMonth(bill.dueDay || 1, cycle.start);
    const dueB = dueDateForMonth(bill.dueDay || 1, cycle.end);

    const inThisCycle =
      isBetweenInclusive(dueA, cycle.start, cycle.end) ||
      isBetweenInclusive(dueB, cycle.start, cycle.end);

    if (inThisCycle) {
      items.push({
        id: `bill_${bill.id}`,
        label: `Pay ${bill.name || "Bill"}`,
        amount: bill.amount,
        category: "Bills",
        notes: `Due day ${bill.dueDay || 1}`,
      });
    }
  }

  for (const m of settings.monthlyItems || []) {
    const dueA = dueDateForMonth(m.dueDay || 1, cycle.start);
    const dueB = dueDateForMonth(m.dueDay || 1, cycle.end);

    const inThisCycle =
      isBetweenInclusive(dueA, cycle.start, cycle.end) ||
      isBetweenInclusive(dueB, cycle.start, cycle.end);

    if (inThisCycle && (m.amount || 0) > 0) {
      items.push({
        id: `monthly_${m.id}`,
        label: `Monthly: ${m.label || "Expense"}`,
        amount: m.amount || 0,
        category: "Monthly",
        notes: `Due day ${m.dueDay || 1}`,
      });
    }
  }

  for (const a of settings.allocations || []) {
    const amt = a.amount || 0;
    if (amt > 0) {
      items.push({
        id: `alloc_${a.id}`,
        label: a.label || "Distribution",
        amount: amt,
        category: "Allocations",
        notes: "Per-pay distribution",
      });
    }
  }

  for (const p of settings.personalSpending || []) {
    const amt = p.amount || 0;
    if (amt > 0) {
      items.push({
        id: `ps_${p.id}`,
        label: p.label || "Personal",
        amount: amt,
        category: "Personal",
        notes: "Per-pay personal spending",
      });
    }
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

  const debtPay = Math.max(
    0,
    (settings.payAmount || 0) - nonDebtTotal - (unexpectedTotal || 0)
  );

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

function displayCategory(cat: Category) {
  if (cat === "Allocations") return "Paycheck Distributions";
  if (cat === "Personal") return "Personal Spending";
  return cat;
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

function Field({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  placeholder,
  onFocusScrollToInput,
  borderColorOverride,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  keyboardType?: "default" | "numeric";
  placeholder?: string;
  onFocusScrollToInput?: (inputRef: React.RefObject<TextInput>) => void;
  borderColorOverride?: string;
}) {
  const inputRef = useRef<TextInput>(null);

  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ color: COLORS.muted, ...TYPE.label }}>{label}</Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="rgba(185,193,204,0.45)"
        onFocus={() => onFocusScrollToInput?.(inputRef)}
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

type Screen = "dashboard" | "settings" | "history" | "history_detail";

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

/** -------------------- Migration -------------------- */

function migrateSettings(raw: any): Settings {
  const base = defaultSettings();
  const s: any = { ...base, ...(raw || {}) };

  if (!Array.isArray(s.bills)) s.bills = [];
  if (!Array.isArray(s.allocations)) s.allocations = [];
  if (!Array.isArray(s.monthlyItems)) s.monthlyItems = [];
  if (!Array.isArray(s.personalSpending)) s.personalSpending = [];

  const oldLabel = raw?.monthlyLabel;
  const oldAmount = raw?.monthlyAmount;
  if (
    s.monthlyItems.length === 0 &&
    (typeof oldLabel === "string" || typeof oldAmount === "number")
  ) {
    const amt = typeof oldAmount === "number" ? oldAmount : 0;
    const lbl = typeof oldLabel === "string" ? oldLabel : "Monthly Expense";
    if ((amt || 0) > 0 || (lbl || "").trim().length > 0) {
      s.monthlyItems = [
        {
          id: `monthly_migrated_${Date.now()}`,
          label: lbl || "Monthly Expense",
          amount: amt || 0,
          dueDay: 1,
        },
      ];
    }
  }

  s.monthlyItems = (s.monthlyItems || []).map((m: any) => ({
    id: String(m.id ?? `monthly_${Date.now()}`),
    label: String(m.label ?? ""),
    amount: Number(m.amount ?? 0) || 0,
    dueDay: clamp(Number(m.dueDay ?? 1) || 1, 1, 31),
  }));

  s.bills = (s.bills || []).map((b: any) => ({
    id: String(b.id ?? `bill_${Date.now()}`),
    name: String(b.name ?? ""),
    amount: Number(b.amount ?? 0) || 0,
    dueDay: clamp(Number(b.dueDay ?? 1) || 1, 1, 31),
  }));

  s.allocations = (s.allocations || []).map((a: any) => ({
    id: String(a.id ?? `alloc_${Date.now()}`),
    label: String(a.label ?? ""),
    amount: Number(a.amount ?? 0) || 0,
  }));

  s.personalSpending = (s.personalSpending || []).map((p: any) => ({
    id: String(p.id ?? `ps_${Date.now()}`),
    label: String(p.label ?? ""),
    amount: Number(p.amount ?? 0) || 0,
  }));

  return s as Settings;
}

/** -------------------- Main -------------------- */

function AppInner() {
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>("dashboard");
  const [loaded, setLoaded] = useState(false);

  const [hasCompletedSetup, setHasCompletedSetup] = useState(false);

  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [checkedByCycle, setCheckedByCycle] = useState<Record<string, CheckedState>>({});
  const [appliedDebtCycles, setAppliedDebtCycles] = useState<Record<string, boolean>>({});
  const [unexpectedByCycle, setUnexpectedByCycle] = useState<Record<string, UnexpectedExpense[]>>(
    {}
  );

  const [cycleOffset, setCycleOffset] = useState(0);

  const dashboardScrollRef = useRef<ScrollView>(null);

  const scrollDashboardToInput = (inputRef: React.RefObject<TextInput>) => {
    requestAnimationFrame(() => {
      const node = findNodeHandle(inputRef.current);
      const responder: any = dashboardScrollRef.current?.getScrollResponder?.();
      if (!node || !responder?.scrollResponderScrollNativeHandleToKeyboard) return;
      responder.scrollResponderScrollNativeHandleToKeyboard(node, 110, true);
    });
  };

  const scrollDashboardToEnd = () => {
    requestAnimationFrame(() => {
      dashboardScrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const [unexpectedOpen, setUnexpectedOpen] = useState(false);
  const [uxLabel, setUxLabel] = useState("");
  const [uxAmount, setUxAmount] = useState("");

  const [historySelectedCycleId, setHistorySelectedCycleId] = useState<string | null>(
    null
  );

  const now = new Date();

  const viewCycle = useMemo(
    () => getCycleWithOffset(settings, now, cycleOffset),
    [settings, now, cycleOffset]
  );

  const activeChecked = checkedByCycle[viewCycle.id] ?? {};
  const unexpected = unexpectedByCycle[viewCycle.id] ?? [];
  const unexpectedTotal = useMemo(
    () => unexpected.reduce((sum, x) => sum + (x.amount || 0), 0),
    [unexpected]
  );

  const items = useMemo(
    () => buildChecklistForCycle(settings, viewCycle, unexpectedTotal),
    [settings, viewCycle, unexpectedTotal]
  );

  const grouped = useMemo(() => groupByCategory(items), [items]);

  const personalSpendingTotal = useMemo(() => {
    return (settings.personalSpending || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [settings.personalSpending]);

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
      const arr = [...(next[viewCycle.id] ?? [])];
      arr.unshift(item);
      next[viewCycle.id] = arr;
      return next;
    });

    setUxLabel("");
    setUxAmount("");
    setUnexpectedOpen(false);
  }

  function removeUnexpected(id: string) {
    setUnexpectedByCycle((prev) => {
      const next = { ...prev };
      next[viewCycle.id] = (next[viewCycle.id] ?? []).filter((x) => x.id !== id);
      return next;
    });
  }

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Persisted;

          if (parsed?.settings) setSettings(migrateSettings(parsed.settings));
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

  useEffect(() => {
    if (!loaded) return;

    const data: Persisted = {
      hasCompletedSetup,
      settings,
      checkedByCycle,
      appliedDebtCycles,
      activeCycleId: viewCycle.id,
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
    viewCycle.id,
  ]);

  function toggleItem(id: string) {
    setCheckedByCycle((prev) => {
      const next = { ...prev };
      const cur = { ...(next[viewCycle.id] ?? {}) };
      const was = cur[id]?.checked ?? false;
      cur[id] = { checked: !was, at: !was ? new Date().toISOString() : undefined };
      next[viewCycle.id] = cur;
      return next;
    });
  }

  useEffect(() => {
    if (!loaded) return;
    if (!hasCompletedSetup) return;

    const debtItem = items.find((i) => i.id === "debt_paydown");
    if (!debtItem) return;

    const debtChecked = !!activeChecked["debt_paydown"]?.checked;
    const alreadyApplied = !!appliedDebtCycles[viewCycle.id];

    if (debtChecked && !alreadyApplied) {
      const payAmount = debtItem.amount || 0;

      setSettings((s) => ({
        ...s,
        debtRemaining: Math.max(0, (s.debtRemaining || 0) - payAmount),
      }));

      setAppliedDebtCycles((p) => ({ ...p, [viewCycle.id]: true }));
    }
  }, [loaded, hasCompletedSetup, activeChecked, appliedDebtCycles, viewCycle.id, items]);

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
          setHistorySelectedCycleId(null);
          setCycleOffset(0);
          setScreen("dashboard");
          try {
            await AsyncStorage.removeItem(STORAGE_KEY);
          } catch {}
        },
      },
    ]);
  }

  const last10Cycles = useMemo(() => {
    if (!hasCompletedSetup) return [];
    return getLastNCycles(settings, new Date(), 10);
  }, [settings, hasCompletedSetup]);

  function getCycleUnexpectedTotal(cycleId: string) {
    const arr = unexpectedByCycle[cycleId] ?? [];
    return arr.reduce((sum, x) => sum + (x.amount || 0), 0);
  }

  function getCycleChecked(cycleId: string) {
    return checkedByCycle[cycleId] ?? {};
  }

  const historySelectedCycle = useMemo(() => {
    if (!historySelectedCycleId) return null;
    return last10Cycles.find((c) => c.id === historySelectedCycleId) ?? null;
  }, [historySelectedCycleId, last10Cycles]);

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

  if (!hasCompletedSetup) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
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
              <Text style={{ color: COLORS.textStrong, ...TYPE.h1 }}>Welcome to PayFlow</Text>
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
                onChange={(s) => setSettings(s)}
                onBack={() => {}}
                onFinishSetup={() => {
                  setHasCompletedSetup(true);
                  setScreen("dashboard");
                  setCycleOffset(0);
                }}
                onResetAll={resetEverything}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "left", "right"]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
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
          <View style={{ paddingTop: Math.max(0, insets.top), alignItems: "center" }}>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <TextBtn
                label="Dashboard"
                onPress={() => {
                  setHistorySelectedCycleId(null);
                  setScreen("dashboard");
                }}
                kind={screen === "dashboard" ? "green" : "default"}
              />
              <TextBtn
                label="History"
                onPress={() => {
                  setHistorySelectedCycleId(null);
                  setScreen("history");
                }}
                kind={screen === "history" || screen === "history_detail" ? "green" : "default"}
              />
              <TextBtn
                label="Settings"
                onPress={() => {
                  setHistorySelectedCycleId(null);
                  setScreen("settings");
                }}
                kind={screen === "settings" ? "green" : "default"}
              />
            </View>
          </View>

          <ScrollView
            ref={dashboardScrollRef}
            style={{ marginTop: 12 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 260, paddingTop: 2 }}
            showsVerticalScrollIndicator={false}
          >
            {screen === "dashboard" ? (
              <>
                <Card>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <TextBtn label="◀︎" onPress={() => setCycleOffset((o) => o - 1)} 
                  />
                    <View style={{ alignItems: "center", flex: 1 }}>
                      <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>
                        {cycleOffset === 0
                          ? "This paycheck"
                          : cycleOffset > 0
                          ? `Next +${cycleOffset}`
                          : `Prev ${cycleOffset}`}
                      </Text>
                      <Text
                        style={{
                          color: COLORS.muted,
                          marginTop: 4,
                          fontWeight: "700",
                          textAlign: "center",
                        }}
                      >
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
                </Card>

                <View style={{ marginTop: 12 }}>
                  <Card>
                    <View style={{ gap: 10 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: COLORS.muted, ...TYPE.label }}>Pay amount</Text>
                        <Chip>{fmtMoney(settings.payAmount)}</Chip>
                      </View>

                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: COLORS.muted, ...TYPE.label }}>Personal spending (per pay)</Text>
                        <Chip>{fmtMoney(personalSpendingTotal)}</Chip>
                      </View>

                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: COLORS.muted, ...TYPE.label }}>Debt remaining</Text>
                        <Chip>{fmtMoney(settings.debtRemaining)}</Chip>
                      </View>

                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: COLORS.muted, ...TYPE.label }}>Unexpected (this cycle)</Text>
                        <Chip>{fmtMoney(unexpectedTotal)}</Chip>
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
                  </Card>
                </View>

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

                <View style={{ marginTop: 12 }}>
                  <Card>
                    <Pressable
                      onPress={() => {
                        const next = !unexpectedOpen;
                        setUnexpectedOpen(next);
                        if (next) scrollDashboardToEnd();
                      }}
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

                        <Field
                          label="Label"
                          value={uxLabel}
                          onChangeText={setUxLabel}
                          placeholder="Car repair"
                          onFocusScrollToInput={scrollDashboardToInput}
                        />

                        <Field
                          label="Amount"
                          value={uxAmount}
                          onChangeText={setUxAmount}
                          keyboardType="numeric"
                          placeholder="0"
                          onFocusScrollToInput={scrollDashboardToInput}
                        />

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
                                      <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>{x.label}</Text>
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
            ) : screen === "history" ? (
              <>
                <Card>
                  <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>History</Text>
                  <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                    Last 10 pay cycles. Tap one to view what you paid, missed, and unexpected expenses.
                  </Text>
                </Card>

                <View style={{ marginTop: 12, gap: 12 }}>
                  {last10Cycles.map((c, idx) => {
                    const uxTot = getCycleUnexpectedTotal(c.id);
                    const its = buildChecklistForCycle(settings, c, uxTot);
                    const checked = getCycleChecked(c.id);

                    const planned = its.reduce((sum, i) => sum + (i.amount || 0), 0);
                    const done = its.reduce((sum, i) => (checked[i.id]?.checked ? sum + (i.amount || 0) : sum), 0);
                    const totalCount = its.length;
                    const doneCount = its.filter((i) => checked[i.id]?.checked).length;
                    const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

                    const metGoal = pct === 100;

                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => {
                          setHistorySelectedCycleId(c.id);
                          setScreen("history_detail");
                        }}
                      >
                        <Card>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>
                                {idx === 0 ? "Current cycle" : `Cycle #${idx + 1}`} • {formatDate(c.payday)}
                              </Text>
                              <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                                {c.label}
                              </Text>
                            </View>

                            <View style={{ alignItems: "flex-end" }}>
                              <Text
                                style={{
                                  color: metGoal ? "rgba(34,197,94,0.95)" : "rgba(251,191,36,0.95)",
                                  fontWeight: "900",
                                }}
                              >
                                {metGoal ? "GOAL MET" : "INCOMPLETE"}
                              </Text>
                              <Text style={{ color: COLORS.muted, fontWeight: "700", marginTop: 4 }}>
                                {doneCount}/{totalCount} ({pct}%)
                              </Text>
                            </View>
                          </View>

                          <Divider />

                          <View style={{ gap: 8 }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ color: COLORS.muted, ...TYPE.label }}>Planned</Text>
                              <Chip>{fmtMoney(planned)}</Chip>
                            </View>

                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ color: COLORS.muted, ...TYPE.label }}>Completed</Text>
                              <Chip>{fmtMoney(done)}</Chip>
                            </View>

                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ color: COLORS.muted, ...TYPE.label }}>Unexpected</Text>
                              <Chip>{fmtMoney(uxTot)}</Chip>
                            </View>
                          </View>

                          <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                            <TextBtn
                              label="View details"
                              onPress={() => {
                                setHistorySelectedCycleId(c.id);
                                setScreen("history_detail");
                              }}
                              kind="green"
                            />
                          </View>
                        </Card>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={{ color: COLORS.faint, marginTop: 14, textAlign: "center", fontWeight: "700" }}>
                  Offline • Saved on-device
                </Text>
              </>
            ) : screen === "history_detail" ? (
              <>
                {historySelectedCycle ? (
                  (() => {
                    const c = historySelectedCycle;
                    const uxArr = unexpectedByCycle[c.id] ?? [];
                    const uxTot = uxArr.reduce((sum, x) => sum + (x.amount || 0), 0);

                    const its = buildChecklistForCycle(settings, c, uxTot);
                    const checked = getCycleChecked(c.id);

                    const planned = its.reduce((sum, i) => sum + (i.amount || 0), 0);
                    const done = its.reduce((sum, i) => (checked[i.id]?.checked ? sum + (i.amount || 0) : sum), 0);

                    const totalCount = its.length;
                    const doneCount = its.filter((i) => checked[i.id]?.checked).length;
                    const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
                    const metGoal = pct === 100;

                    const bills = its.filter((i) => i.category === "Bills");
                    const billsPaid = bills.filter((b) => !!checked[b.id]?.checked);
                    const billsMissed = bills.filter((b) => !checked[b.id]?.checked);

                    const missedItems = its.filter((i) => !checked[i.id]?.checked);

                    return (
                      <>
                        <Card>
                          <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Cycle details</Text>
                          <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                            {c.label} • Payday {formatDate(c.payday)}
                          </Text>

                          <Divider />

                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ color: COLORS.muted, ...TYPE.label }}>Goal</Text>
                            <Chip>{metGoal ? "Met ✅" : "Not met ⚠️"}</Chip>
                          </View>

                          <View style={{ marginTop: 10, gap: 8 }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ color: COLORS.muted, ...TYPE.label }}>Progress</Text>
                              <Chip>
                                {doneCount}/{totalCount} ({pct}%)
                              </Chip>
                            </View>

                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ color: COLORS.muted, ...TYPE.label }}>Planned</Text>
                              <Chip>{fmtMoney(planned)}</Chip>
                            </View>

                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ color: COLORS.muted, ...TYPE.label }}>Completed</Text>
                              <Chip>{fmtMoney(done)}</Chip>
                            </View>

                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ color: COLORS.muted, ...TYPE.label }}>Unexpected</Text>
                              <Chip>{fmtMoney(uxTot)}</Chip>
                            </View>
                          </View>

                          <Divider />

                          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                            <TextBtn
                              label="Back to history"
                              onPress={() => {
                                setHistorySelectedCycleId(null);
                                setScreen("history");
                              }}
                            />
                            <TextBtn
                              label="Dashboard"
                              onPress={() => {
                                setHistorySelectedCycleId(null);
                                setCycleOffset(0);
                                setScreen("dashboard");
                              }}
                              kind="green"
                            />
                          </View>
                        </Card>

                        <View style={{ marginTop: 12 }}>
                          <Card>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Unexpected expenses</Text>
                              <Chip>{fmtMoney(uxTot)}</Chip>
                            </View>

                            <Divider />

                            {uxArr.length === 0 ? (
                              <Text style={{ color: COLORS.muted, fontWeight: "700" }}>None recorded for this cycle.</Text>
                            ) : (
                              <View style={{ gap: 10 }}>
                                {uxArr.map((x) => (
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
                                    <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>{x.label}</Text>
                                    <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                                      {fmtMoney(x.amount)} • {new Date(x.atISO).toLocaleString()}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </Card>
                        </View>

                        <View style={{ marginTop: 12 }}>
                          <Card>
                            <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Bills</Text>
                            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                              Paid: {billsPaid.length} • Missed: {billsMissed.length}
                            </Text>

                            <Divider />

                            {bills.length === 0 ? (
                              <Text style={{ color: COLORS.muted, fontWeight: "700" }}>
                                No bills fell due in this cycle.
                              </Text>
                            ) : (
                              <>
                                {billsPaid.length > 0 ? (
                                  <>
                                    <Text style={{ color: "rgba(34,197,94,0.95)", fontWeight: "900" }}>Paid</Text>
                                    <View style={{ gap: 10, marginTop: 8 }}>
                                      {billsPaid.map((b) => (
                                        <View
                                          key={b.id}
                                          style={{
                                            padding: 12,
                                            borderRadius: 16,
                                            borderWidth: 1,
                                            borderColor: COLORS.borderSoft,
                                            backgroundColor: COLORS.greenSoft,
                                          }}
                                        >
                                          <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>✅ {b.label}</Text>
                                          <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                                            {fmtMoney(b.amount)}{b.notes ? ` • ${b.notes}` : ""}
                                          </Text>
                                        </View>
                                      ))}
                                    </View>
                                  </>
                                ) : null}

                                {billsMissed.length > 0 ? (
                                  <>
                                    <Divider />
                                    <Text style={{ color: "rgba(251,191,36,0.95)", fontWeight: "900" }}>Missed</Text>
                                    <View style={{ gap: 10, marginTop: 8 }}>
                                      {billsMissed.map((b) => (
                                        <View
                                          key={b.id}
                                          style={{
                                            padding: 12,
                                            borderRadius: 16,
                                            borderWidth: 1,
                                            borderColor: COLORS.borderSoft,
                                            backgroundColor: COLORS.amberSoft,
                                          }}
                                        >
                                          <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>⬜ {b.label}</Text>
                                          <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                                            {fmtMoney(b.amount)}{b.notes ? ` • ${b.notes}` : ""}
                                          </Text>
                                        </View>
                                      ))}
                                    </View>
                                  </>
                                ) : null}
                              </>
                            )}
                          </Card>
                        </View>

                        <View style={{ marginTop: 12 }}>
                          <Card>
                            <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Missed items</Text>
                            <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                              Anything not checked in that cycle.
                            </Text>

                            <Divider />

                            {missedItems.length === 0 ? (
                              <Text style={{ color: COLORS.muted, fontWeight: "700" }}>None — you completed everything ✅</Text>
                            ) : (
                              <View style={{ gap: 10 }}>
                                {missedItems.map((i) => (
                                  <View
                                    key={i.id}
                                    style={{
                                      padding: 12,
                                      borderRadius: 16,
                                      borderWidth: 1,
                                      borderColor: COLORS.borderSoft,
                                      backgroundColor: COLORS.amberSoft,
                                    }}
                                  >
                                    <Text style={{ color: COLORS.textStrong, fontWeight: "900" }}>⬜ {i.label}</Text>
                                    <Text style={{ color: COLORS.muted, marginTop: 4, fontWeight: "700" }}>
                                      {fmtMoney(i.amount)} • {displayCategory(i.category)}
                                      {i.notes ? ` • ${i.notes}` : ""}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </Card>
                        </View>

                        <Text style={{ color: COLORS.faint, marginTop: 14, textAlign: "center", fontWeight: "700" }}>
                          Offline • Saved on-device
                        </Text>
                      </>
                    );
                  })()
                ) : (
                  <Card>
                    <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Cycle not found</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
                      Select a cycle again from History.
                    </Text>
                    <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                      <TextBtn label="Back to history" onPress={() => setScreen("history")} kind="green" />
                    </View>
                  </Card>
                )}
              </>
            ) : (
              <SettingsScreen
                mode="normal"
                settings={settings}
                onChange={(s) => setSettings(s)}
                onBack={() => setScreen("dashboard")}
                onFinishSetup={() => {}}
                onResetAll={resetEverything}
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
  onResetAll,
}: {
  mode: "setup" | "normal";
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
  onFinishSetup: () => void;
  onResetAll: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [local, setLocal] = useState<Settings>(settings);

  const [showAnchorPicker, setShowAnchorPicker] = useState(false);
  const [anchorError, setAnchorError] = useState(false);

  const [billDueText, setBillDueText] = useState<Record<string, string>>({});
  const [monthlyDueText, setMonthlyDueText] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocal(settings);

    const nextBillMap: Record<string, string> = {};
    for (const b of settings.bills || []) nextBillMap[b.id] = String(b.dueDay ?? 1);

    const nextMonthlyMap: Record<string, string> = {};
    for (const m of settings.monthlyItems || []) nextMonthlyMap[m.id] = String(m.dueDay ?? 1);

    setBillDueText(nextBillMap);
    setMonthlyDueText(nextMonthlyMap);
  }, [settings]);

  const scrollSettingsToInput = (inputRef: React.RefObject<TextInput>) => {
    requestAnimationFrame(() => {
      const node = findNodeHandle(inputRef.current);
      const responder: any = scrollRef.current?.getScrollResponder?.();
      if (!node || !responder?.scrollResponderScrollNativeHandleToKeyboard) return;
      responder.scrollResponderScrollNativeHandleToKeyboard(node, 110, true);
    });
  };

  function save() {
    if (
      (local.payFrequency === "weekly" || local.payFrequency === "biweekly") &&
      !hasValidAnchorDate(local.anchorISO)
    ) {
      if (mode === "setup") {
        setAnchorError(true);
        Alert.alert("Select a payday", "Please choose your payday to finish setup.");
        return;
      }
    }

    const bills: Bill[] = (local.bills || []).map((b) => {
      const t = billDueText[b.id] ?? String(b.dueDay ?? 1);
      const n = clamp(Math.floor(safeParseNumber(t)), 1, 31);
      return { ...b, dueDay: n };
    });

    const monthlyItems: MonthlyItem[] = (local.monthlyItems || []).map((m) => {
      const t = monthlyDueText[m.id] ?? String(m.dueDay ?? 1);
      const n = clamp(Math.floor(safeParseNumber(t)), 1, 31);
      return { ...m, dueDay: n };
    });

    const nextLocal: Settings = { ...local, bills, monthlyItems };

    if (nextLocal.payAmount < 0) return Alert.alert("Invalid", "Pay amount must be >= 0");
    if (nextLocal.debtRemaining < 0) return Alert.alert("Invalid", "Debt remaining must be >= 0");
    if (nextLocal.twiceMonthlyDay1 < 1 || nextLocal.twiceMonthlyDay1 > 28)
      return Alert.alert("Invalid", "Twice-monthly day #1 must be 1–28");
    if (nextLocal.twiceMonthlyDay2 < 1 || nextLocal.twiceMonthlyDay2 > 28)
      return Alert.alert("Invalid", "Twice-monthly day #2 must be 1–28");
    if (nextLocal.monthlyPayDay < 1 || nextLocal.monthlyPayDay > 28)
      return Alert.alert("Invalid", "Monthly payday must be 1–28");

    onChange(nextLocal);

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
      bills: [...(s.bills || []), { id, name: "", amount: 0, dueDay: 1 }],
    }));
    setBillDueText((m) => ({ ...m, [id]: "1" }));
  }

  function removeBill(id: string) {
    setLocal((s) => ({
      ...s,
      bills: (s.bills || []).filter((b) => b.id !== id),
    }));
    setBillDueText((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

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

  function addMonthlyItem() {
    const id = `monthly_${Date.now()}`;
    setLocal((s) => ({
      ...s,
      monthlyItems: [...(s.monthlyItems || []), { id, label: "", amount: 0, dueDay: 1 }],
    }));
    setMonthlyDueText((m) => ({ ...m, [id]: "1" }));
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

  const freqLabel = (f: PayFrequency) => {
    if (f === "weekly") return "Weekly";
    if (f === "biweekly") return "Bi-weekly";
    if (f === "twice_monthly") return "Twice-monthly";
    return "Monthly";
  };

  const shouldShowAnchor = local.payFrequency === "weekly" || local.payFrequency === "biweekly";
  const anchorSelected = hasValidAnchorDate(local.anchorISO);

  const keepDigitsOnly = (s: string) => s.replace(/[^0-9]/g, "");

  return (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 260 }}
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
            onFocusScrollToInput={scrollSettingsToInput}
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
                onFocusScrollToInput={scrollSettingsToInput}
              />
              <Field
                label="Twice-monthly payday #2 (1–28)"
                value={String(local.twiceMonthlyDay2)}
                onChangeText={(s) =>
                  setLocal((p) => ({ ...p, twiceMonthlyDay2: clamp(safeParseNumber(s), 1, 28) }))
                }
                keyboardType="numeric"
                placeholder="15"
                onFocusScrollToInput={scrollSettingsToInput}
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
              onFocusScrollToInput={scrollSettingsToInput}
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
            onFocusScrollToInput={scrollSettingsToInput}
          />
        </Card>

        <Card>
          <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Paycheck Distributions</Text>
          <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
            Items that repeat every pay cycle (e.g., Savings, Investing, Fuel).
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
                  onFocusScrollToInput={scrollSettingsToInput}
                />
                <Field
                  label="Amount"
                  value={String(a.amount)}
                  onChangeText={(s) => updateDistribution(a.id, { amount: safeParseNumber(s) })}
                  keyboardType="numeric"
                  placeholder="0"
                  onFocusScrollToInput={scrollSettingsToInput}
                />

                <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                  <TextBtn label="Remove distribution" onPress={() => removeDistribution(a.id)} kind="red" />
                </View>
              </View>
            ))}

            <TextBtn label="Add distribution" onPress={addDistribution} />
          </View>
        </Card>

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
                  onFocusScrollToInput={scrollSettingsToInput}
                />
                <Field
                  label="Amount"
                  value={String(p.amount)}
                  onChangeText={(s) => updatePersonalSpending(p.id, { amount: safeParseNumber(s) })}
                  keyboardType="numeric"
                  placeholder="0"
                  onFocusScrollToInput={scrollSettingsToInput}
                />

                <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                  <TextBtn label="Remove personal item" onPress={() => removePersonalSpending(p.id)} kind="red" />
                </View>
              </View>
            ))}

            <TextBtn label="Add personal spending" onPress={addPersonalSpending} />
          </View>
        </Card>

        <Card>
          <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Monthly Expenses</Text>
          <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
            Each monthly expense appears in the paycheck cycle that contains its due day (like bills).
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
                  placeholder="Rent"
                  onFocusScrollToInput={scrollSettingsToInput}
                />

                <Field
                  label="Amount"
                  value={String(m.amount)}
                  onChangeText={(s) => updateMonthlyItem(m.id, { amount: safeParseNumber(s) })}
                  keyboardType="numeric"
                  placeholder="0"
                  onFocusScrollToInput={scrollSettingsToInput}
                />

                <Field
                  label="Due day (1–31)"
                  value={monthlyDueText[m.id] ?? String(m.dueDay ?? 1)}
                  onChangeText={(s) => setMonthlyDueText((map) => ({ ...map, [m.id]: keepDigitsOnly(s) }))}
                  keyboardType="numeric"
                  placeholder="1"
                  onFocusScrollToInput={scrollSettingsToInput}
                />

                <View style={{ marginTop: 10, alignItems: "flex-start" }}>
                  <TextBtn label="Remove monthly expense" onPress={() => removeMonthlyItem(m.id)} kind="red" />
                </View>
              </View>
            ))}

            <TextBtn label="Add monthly expense" onPress={addMonthlyItem} />
          </View>
        </Card>

        <Card>
          <Text style={{ color: COLORS.textStrong, ...TYPE.h2 }}>Bills (due day)</Text>
          <Text style={{ color: COLORS.muted, marginTop: 6, fontWeight: "700" }}>
            Bills show up automatically in the paycheck cycle that contains their due date.
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
                  onFocusScrollToInput={scrollSettingsToInput}
                />

                <Field
                  label="Amount"
                  value={String(b.amount)}
                  onChangeText={(s) => updateBill(b.id, { amount: safeParseNumber(s) })}
                  keyboardType="numeric"
                  placeholder="0"
                  onFocusScrollToInput={scrollSettingsToInput}
                />

                <Field
                  label="Due day (1–31)"
                  value={billDueText[b.id] ?? String(b.dueDay ?? 1)}
                  onChangeText={(s) => setBillDueText((map) => ({ ...map, [b.id]: keepDigitsOnly(s) }))}
                  keyboardType="numeric"
                  placeholder="1"
                  onFocusScrollToInput={scrollSettingsToInput}
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

        {/* ✅ Reset ALL ONLY here at the bottom of Settings */}
        <View style={{ marginTop: 12 }}>
          <TextBtn label="Reset ALL (start over)" onPress={onResetAll} kind="red" />
        </View>

        <Text style={{ color: COLORS.faint, marginTop: 10, textAlign: "center", fontWeight: "700" }}>
          Offline • Saved on-device
        </Text>
      </View>
    </ScrollView>
  );
}
