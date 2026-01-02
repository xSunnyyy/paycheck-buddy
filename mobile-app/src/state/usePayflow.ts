// src/state/usePayflow.ts
import { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type PayFrequency = "weekly" | "biweekly" | "twice_monthly" | "monthly";

// ✅ Bills -> Credit Cards
type Category = "Credit Cards" | "Monthly" | "Allocations" | "Personal" | "Debt";

// ✅ NEW
export type CreditCard = {
  id: string;
  name: string;
  totalDue: number; // statement balance due this month (informational)
  minDue: number; // minimum payment required
  dueDay: number; // 1–31 (day of month)
};

export type Allocation = { id: string; label: string; amount: number };
export type PersonalSpendingItem = { id: string; label: string; amount: number };
export type MonthlyItem = { id: string; label: string; amount: number; dueDay: number };

// ✅ Keep Bill type ONLY for migration/backwards compatibility
export type Bill = { id: string; name: string; amount: number; dueDay: number };

export type Settings = {
  payFrequency: PayFrequency;
  payAmount: number;
  anchorISO: string;

  twiceMonthlyDay1: number;
  twiceMonthlyDay2: number;
  monthlyPayDay: number;

  creditCards: CreditCard[];
  monthlyItems: MonthlyItem[];
  allocations: Allocation[];
  personalSpending: PersonalSpendingItem[];

  // total debt you’re tracking (cards + other), reduced when payments are applied
  debtRemaining: number;
};

export type CheckedState = Record<string, { checked: boolean; at?: string }>;

export type Cycle = {
  id: string;
  label: string;
  start: Date;
  end: Date;
  payday: Date;
};

export type UnexpectedExpense = {
  id: string;
  label: string;
  amount: number;
  atISO: string;
};

type Persisted = {
  hasCompletedSetup: boolean;
  settings: any;
  checkedByCycle: Record<string, CheckedState>;
  // once-per-cycle apply guard for debtRemaining reduction
  appliedDebtCycles: Record<string, boolean>;
  activeCycleId?: string;
  unexpectedByCycle?: Record<string, UnexpectedExpense[]>;
};

// NOTE: Keep the same storage key so we can migrate old data safely
const STORAGE_KEY = "payflow_mobile_v1";

/**
 * ✅ IMPORTANT (setup-complete correctness)
 * If your app/_layout.tsx gate currently uses src/storage/setup.getSetupComplete(),
 * you MUST make that function read the SAME truth as this file.
 *
 * Easiest: in app/_layout.tsx, stop using getSetupComplete() and use these instead:
 *    await getSetupCompleteFromPayflow()
 *
 * And in SettingsScreen "Finish setup", also call:
 *    await setSetupCompleteForPayflow(true)
 */
export async function getSetupCompleteFromPayflow(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Persisted;
    return !!parsed?.hasCompletedSetup;
  } catch {
    return false;
  }
}

export async function setSetupCompleteForPayflow(done: boolean): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Persisted) : null;

    const next: Persisted = {
      hasCompletedSetup: !!done,
      settings: parsed?.settings ?? defaultSettings(),
      checkedByCycle: parsed?.checkedByCycle ?? {},
      appliedDebtCycles: parsed?.appliedDebtCycles ?? {},
      activeCycleId: parsed?.activeCycleId,
      unexpectedByCycle: parsed?.unexpectedByCycle ?? {},
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export const defaultSettings = (): Settings => ({
  payFrequency: "biweekly",
  payAmount: 0,
  anchorISO: "",

  twiceMonthlyDay1: 1,
  twiceMonthlyDay2: 15,
  monthlyPayDay: 1,

  creditCards: [],
  monthlyItems: [],
  allocations: [],
  personalSpending: [],

  debtRemaining: 0,
});

export const safeParseNumber = (s: string) => {
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Math.max(0, n || 0)
  );

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

export const formatDate = (d: Date) =>
  d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const hasValidAnchorDate = (iso: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime());
};

const cycleIdFromDate = (prefix: string, d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${prefix}_${y}-${m}-${day}`;
};

const isBetweenInclusive = (d: Date, a: Date, b: Date) => {
  const t = d.getTime();
  return t >= a.getTime() && t <= b.getTime();
};

const dueDateForMonth = (dueDay: number, ref: Date) => {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = clamp(dueDay || 1, 1, lastDay);
  return startOfDay(new Date(year, month, day));
};

export type ChecklistItem = {
  id: string;
  label: string;
  amount: number;
  category: Category;
  notes?: string;
};

export const displayCategory = (cat: Category) => {
  if (cat === "Allocations") return "Paycheck Distributions";
  if (cat === "Personal") return "Personal Spending";
  return cat;
};

export const getCurrentCycle = (settings: Settings, now = new Date()): Cycle => {
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
    } else if (n.getTime() < payB.getTime()) payday = payA;
    else payday = payB;

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
  } else payday = payThis;

  const start = payday;
  const nextMonth = new Date(payday.getFullYear(), payday.getMonth() + 1, 1);
  const nextPayday = startOfDay(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day));
  const end = addDays(nextPayday, -1);

  const id = cycleIdFromDate("monthly", payday);
  const label = `Month cycle ${formatDate(payday)}`;
  return { id, label, start, end, payday };
};

export const getCycleWithOffset = (settings: Settings, now: Date, offset: number) => {
  let c = getCurrentCycle(settings, now);
  if (offset === 0) return c;

  if (offset > 0) {
    for (let i = 0; i < offset; i++) c = getCurrentCycle(settings, addDays(c.end, 1));
    return c;
  }

  for (let i = 0; i < Math.abs(offset); i++) c = getCurrentCycle(settings, addDays(c.start, -1));
  return c;
};

export const getLastNCycles = (settings: Settings, now: Date, n: number) => {
  const cycles: Cycle[] = [];
  const seen = new Set<string>();

  let cur = getCurrentCycle(settings, now);
  while (cycles.length < n && !seen.has(cur.id)) {
    cycles.push(cur);
    seen.add(cur.id);
    cur = getCurrentCycle(settings, addDays(cur.start, -1));
    if (cycles.length > n + 5) break;
  }
  return cycles;
};

/**
 * ✅ Payoff / Minimum Due logic
 *
 * For each cycle:
 * 1) Include minimum payments for cards whose due date falls within the cycle.
 * 2) Compute remainder = payAmount - (mins + monthly + allocations + personal + unexpected).
 * 3) If remainder > 0, create ONE extra-payoff item to the “best” target card to pay down fastest:
 *    - Heuristic (no APR available): pick the card with the largest (totalDue - minDue) due this cycle,
 *      otherwise the card with the largest totalDue overall.
 * 4) Debt Paydown item becomes informational/backup; we keep it to preserve your “auto-decrease once/cycle” behavior.
 */
function choosePayoffTargetCard(
  settings: Settings,
  dueThisCycle: CreditCard[]
): CreditCard | null {
  const all = settings.creditCards || [];
  if (all.length === 0) return null;

  const candidates = dueThisCycle.length > 0 ? dueThisCycle : all;

  // Prefer highest remaining after minimum (a simple “pay down fastest” proxy)
  let best = candidates[0];
  let bestScore = Math.max(0, (best.totalDue || 0) - (best.minDue || 0));

  for (const c of candidates) {
    const score = Math.max(0, (c.totalDue || 0) - (c.minDue || 0));
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }

  // If everything tied at 0, fall back to highest totalDue
  if (bestScore <= 0) {
    best = candidates.reduce((acc, cur) => ((cur.totalDue || 0) > (acc.totalDue || 0) ? cur : acc), candidates[0]);
  }

  return best ?? null;
}

export const buildChecklistForCycle = (
  settings: Settings,
  cycle: Cycle,
  unexpectedTotal = 0
): ChecklistItem[] => {
  const items: ChecklistItem[] = [];

  // 1) CREDIT CARD minimums due in this cycle
  const cardsDueThisCycle: CreditCard[] = [];
  for (const card of settings.creditCards || []) {
    const dueA = dueDateForMonth(card.dueDay || 1, cycle.start);
    const dueB = dueDateForMonth(card.dueDay || 1, cycle.end);

    const inThisCycle =
      isBetweenInclusive(dueA, cycle.start, cycle.end) ||
      isBetweenInclusive(dueB, cycle.start, cycle.end);

    if (inThisCycle) cardsDueThisCycle.push(card);

    if (inThisCycle && (card.minDue || 0) > 0) {
      items.push({
        id: `cc_min_${card.id}`,
        label: `Pay ${card.name || "Credit Card"} (minimum)`,
        amount: card.minDue || 0,
        category: "Credit Cards",
        notes: `Total due ${fmtMoney(card.totalDue || 0)} • Due day ${card.dueDay || 1}`,
      });
    }
  }

  // 2) Monthly expenses (due in this cycle)
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

  // 3) Allocations (per-pay)
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

  // 4) Personal spending (per-pay)
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

  // 5) Compute remainder AFTER minimums + monthly + allocations + personal + unexpected
  const plannedNonDebt = items.reduce((sum, i) => sum + (i.amount || 0), 0);
  const remainder = Math.max(0, (settings.payAmount || 0) - plannedNonDebt - (unexpectedTotal || 0));

  // 6) Add ONE “extra payoff” item if remainder > 0 and there is at least one card
  const payoffTarget = remainder > 0 ? choosePayoffTargetCard(settings, cardsDueThisCycle) : null;
  if (payoffTarget && remainder > 0) {
    items.push({
      id: `cc_extra_${payoffTarget.id}`,
      label: `Extra payment to ${payoffTarget.name || "Credit Card"}`,
      amount: remainder,
      category: "Credit Cards",
      notes:
        cardsDueThisCycle.length > 0
          ? "Uses leftover after minimums to pay down fastest"
          : "Uses leftover after planned items to pay down fastest",
    });
  }

  // 7) Keep Debt Paydown item (for your existing “auto-decrease once per cycle” behavior)
  //    We set this to the SAME remainder amount, so your existing auto-apply can continue
  //    even if you don’t check the extra item.
  items.push({
    id: "debt_paydown",
    label: "Debt Paydown",
    amount: remainder,
    category: "Debt",
    notes: payoffTarget
      ? `Leftover after planned + unexpected. Suggested target: ${payoffTarget.name || "Credit Card"}`
      : "Leftover after planned + unexpected",
  });

  return items;
};

export const groupByCategory = (items: ChecklistItem[]) => {
  const map = new Map<Category, ChecklistItem[]>();
  for (const it of items) {
    const arr = map.get(it.category) ?? [];
    arr.push(it);
    map.set(it.category, arr);
  }
  return Array.from(map.entries());
};

function migrateSettings(raw: any): Settings {
  const base = defaultSettings();
  const s: any = { ...base, ...(raw || {}) };

  // Ensure arrays
  if (!Array.isArray(s.allocations)) s.allocations = [];
  if (!Array.isArray(s.monthlyItems)) s.monthlyItems = [];
  if (!Array.isArray(s.personalSpending)) s.personalSpending = [];
  if (!Array.isArray(s.creditCards)) s.creditCards = [];

  // Backward compatibility: migrate old "bills" -> creditCards if needed
  const hasOldBills = Array.isArray(s.bills) && s.bills.length > 0;
  const hasCardsAlready = Array.isArray(s.creditCards) && s.creditCards.length > 0;

  if (!hasCardsAlready && hasOldBills) {
    const oldBills: Bill[] = s.bills;
    s.creditCards = oldBills.map((b: any) => ({
      id: String(b.id ?? `cc_${Date.now()}`),
      name: String(b.name ?? ""),
      totalDue: Number(b.amount ?? 0) || 0,
      // old bills only had one amount, so set minDue = amount as a safe starting point
      minDue: Number(b.amount ?? 0) || 0,
      dueDay: clamp(Number(b.dueDay ?? 1) || 1, 1, 31),
    }));
  }

  // Normalize monthly items
  s.monthlyItems = (s.monthlyItems || []).map((m: any) => ({
    id: String(m.id ?? `monthly_${Date.now()}`),
    label: String(m.label ?? ""),
    amount: Number(m.amount ?? 0) || 0,
    dueDay: clamp(Number(m.dueDay ?? 1) || 1, 1, 31),
  }));

  // Normalize credit cards
  s.creditCards = (s.creditCards || []).map((c: any) => ({
    id: String(c.id ?? `cc_${Date.now()}`),
    name: String(c.name ?? ""),
    totalDue: Number(c.totalDue ?? 0) || 0,
    minDue: Number(c.minDue ?? 0) || 0,
    dueDay: clamp(Number(c.dueDay ?? 1) || 1, 1, 31),
  }));

  // Normalize allocations
  s.allocations = (s.allocations || []).map((a: any) => ({
    id: String(a.id ?? `alloc_${Date.now()}`),
    label: String(a.label ?? ""),
    amount: Number(a.amount ?? 0) || 0,
  }));

  // Normalize personal spending
  s.personalSpending = (s.personalSpending || []).map((p: any) => ({
    id: String(p.id ?? `ps_${Date.now()}`),
    label: String(p.label ?? ""),
    amount: Number(p.amount ?? 0) || 0,
  }));

  // anchorISO
  if (typeof s.anchorISO !== "string") s.anchorISO = "";

  // payFrequency validity
  const okFreq: PayFrequency[] = ["weekly", "biweekly", "twice_monthly", "monthly"];
  if (!okFreq.includes(s.payFrequency)) s.payFrequency = "biweekly";

  return s as Settings;
}

export function usePayflow() {
  const [loaded, setLoaded] = useState(false);

  // ✅ This is the single source of truth inside Payflow storage
  const [hasCompletedSetup, setHasCompletedSetup] = useState(false);

  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [checkedByCycle, setCheckedByCycle] = useState<Record<string, CheckedState>>({});
  const [appliedDebtCycles, setAppliedDebtCycles] = useState<Record<string, boolean>>({});
  const [unexpectedByCycle, setUnexpectedByCycle] = useState<Record<string, UnexpectedExpense[]>>({});
  const [cycleOffset, setCycleOffset] = useState(0);

  const nowRef = useRef(new Date());
  const now = nowRef.current;

  const viewCycle = useMemo(
    () => getCycleWithOffset(settings, now, cycleOffset),
    [settings, cycleOffset, now]
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

  const personalSpendingTotal = useMemo(
    () => (settings.personalSpending || []).reduce((sum, p) => sum + (p.amount || 0), 0),
    [settings.personalSpending]
  );

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

  // load
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
        }
      } catch {
        // ignore -> defaults
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // save
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

  const toggleItem = (id: string) => {
    setCheckedByCycle((prev) => {
      const next = { ...prev };
      const cur = { ...(next[viewCycle.id] ?? {}) };
      const was = cur[id]?.checked ?? false;
      cur[id] = { checked: !was, at: !was ? new Date().toISOString() : undefined };
      next[viewCycle.id] = cur;
      return next;
    });
  };

  /**
   * ✅ Apply-to-debt logic (once per cycle)
   * We keep your existing behavior: the app only reduces debtRemaining once per cycle
   * when the user checks the "Debt Paydown" item.
   *
   * The Debt Paydown amount is now “remainder after minimums + planned + unexpected”.
   */
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

  const addUnexpected = (label: string, amountText: string) => {
    const amt = safeParseNumber(amountText);
    if (amt <= 0) return false;

    const item: UnexpectedExpense = {
      id: `ux_${Date.now()}`,
      label: (label || "Unexpected expense").trim(),
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

    return true;
  };

  const removeUnexpected = (cycleId: string, id: string) => {
    setUnexpectedByCycle((prev) => {
      const next = { ...prev };
      next[cycleId] = (next[cycleId] ?? []).filter((x) => x.id !== id);
      return next;
    });
  };

  const resetEverything = async () => {
    setSettings(defaultSettings());
    setCheckedByCycle({});
    setAppliedDebtCycles({});
    setUnexpectedByCycle({});
    setHasCompletedSetup(false);
    setCycleOffset(0);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const last10Cycles = useMemo(
    () => (hasCompletedSetup ? getLastNCycles(settings, new Date(), 10) : []),
    [settings, hasCompletedSetup]
  );

  const getCycleUnexpectedTotal = (cycleId: string) => {
    const arr = unexpectedByCycle[cycleId] ?? [];
    return arr.reduce((sum, x) => sum + (x.amount || 0), 0);
  };

  const getCycleChecked = (cycleId: string) => checkedByCycle[cycleId] ?? {};

  return {
    loaded,

    // setup
    hasCompletedSetup,
    setHasCompletedSetup,

    settings,
    setSettings,

    cycleOffset,
    setCycleOffset,

    viewCycle,
    items,
    grouped,
    activeChecked,
    totals,

    unexpected,
    unexpectedTotal,
    addUnexpected,
    removeUnexpected,

    personalSpendingTotal,

    last10Cycles,
    getCycleUnexpectedTotal,
    getCycleChecked,

    toggleItem,
    resetEverything,
  };
}
