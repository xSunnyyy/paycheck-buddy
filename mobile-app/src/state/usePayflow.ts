// src/state/usePayflow.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// --- Types (Kept exactly as yours) ---
type PayFrequency = "weekly" | "biweekly" | "twice_monthly" | "monthly";
type Category = "Credit Cards" | "Monthly" | "Allocations" | "Personal" | "Debt";

export type CreditCard = {
  id: string;
  name: string;
  balance: number;
  totalDue: number;
  minDue: number;
  dueDay: number;
};

export type Allocation = { id: string; label: string; amount: number };
export type PersonalSpendingItem = { id: string; label: string; amount: number };
export type MonthlyItem = { id: string; label: string; amount: number; dueDay: number };
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
  cardId?: string;
};

export type CardPayment = {
  id: string;
  cardId: string;
  amount: number;
  atISO: string;
};

type Persisted = {
  hasCompletedSetup: boolean;
  settings: any;
  checkedByCycle: Record<string, CheckedState>;
  appliedItemReductions: Record<string, boolean>;
  activeCycleId?: string;
  unexpectedByCycle?: Record<string, UnexpectedExpense[]>;
  cardPaymentsByCycle?: Record<string, CardPayment[]>;
};

const STORAGE_KEY = "payflow_mobile_v1";

// --- Helper Functions ---

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
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.max(0, n || 0));

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
    const anchorISO = hasValidAnchorDate(settings.anchorISO) ? settings.anchorISO : new Date().toISOString();
    const anchor = startOfDay(new Date(anchorISO));

    const t = n.getTime();
    const a = anchor.getTime();
    const diff = t - a;
    
    // Improved calc to handle past/future correctly
    const idx = Math.floor(diff / msStep);
    
    // Always find the payday that starts the CURRENT cycle (payday <= now < nextPayday)
    // If today is payday, we are in this cycle.
    const payday = startOfDay(new Date(a + idx * msStep));
    
    const start = payday;
    const end = addDays(start, settings.payFrequency === "weekly" ? 6 : 13);
    const id = cycleIdFromDate(settings.payFrequency, payday);
    const label = settings.payFrequency === "weekly" ? `Week of ${formatDate(payday)}` : `Bi-week of ${formatDate(payday)}`;

    return { id, label, start, end, payday };
  }

  // (Keeping monthly logic same as yours, it looked correct)
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

  // Monthly
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

export const buildChecklistForCycle = (
  settings: Settings,
  cycle: Cycle,
  unexpectedTotal = 0,
  manualPaymentsTotal = 0
): ChecklistItem[] => {
  const items: ChecklistItem[] = [];

  for (const card of settings.creditCards || []) {
    if ((card.balance || 0) <= 0) continue;
    const dueA = dueDateForMonth(card.dueDay || 1, cycle.start);
    const dueB = dueDateForMonth(card.dueDay || 1, cycle.end);
    const inThisCycle = isBetweenInclusive(dueA, cycle.start, cycle.end) || isBetweenInclusive(dueB, cycle.start, cycle.end);

    if (inThisCycle && (card.minDue || 0) > 0) {
      items.push({
        id: `cc_min_${card.id}`,
        label: `Pay ${card.name || "Credit Card"} (minimum)`,
        amount: card.minDue || 0,
        category: "Credit Cards",
        notes: `Balance ${fmtMoney(card.balance || 0)} • Due day ${card.dueDay || 1}`,
      });
    }
  }

  for (const m of settings.monthlyItems || []) {
    const dueA = dueDateForMonth(m.dueDay || 1, cycle.start);
    const dueB = dueDateForMonth(m.dueDay || 1, cycle.end);
    const inThisCycle = isBetweenInclusive(dueA, cycle.start, cycle.end) || isBetweenInclusive(dueB, cycle.start, cycle.end);

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
    if ((a.amount || 0) > 0) {
      items.push({ id: `alloc_${a.id}`, label: a.label || "Distribution", amount: a.amount || 0, category: "Allocations", notes: "Per-pay distribution" });
    }
  }

  for (const p of settings.personalSpending || []) {
    if ((p.amount || 0) > 0) {
      items.push({ id: `ps_${p.id}`, label: p.label || "Personal", amount: p.amount || 0, category: "Personal", notes: "Per-pay personal spending" });
    }
  }

  const plannedNonDebt = items.reduce((sum, i) => sum + (i.amount || 0), 0);
  const remainder = Math.max(0, (settings.payAmount || 0) - plannedNonDebt - (unexpectedTotal || 0) - (manualPaymentsTotal || 0));

  items.push({ id: "debt_paydown", label: "Debt Paydown", amount: remainder, category: "Debt", notes: "Leftover after planned + unexpected + manual card payments" });

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

  // Migration logic kept same...
  const hasOldBills = Array.isArray(s.bills) && s.bills.length > 0;
  const hasCardsAlready = Array.isArray(s.creditCards) && s.creditCards.length > 0;
  if (!hasCardsAlready && hasOldBills) {
    const oldBills: Bill[] = s.bills;
    s.creditCards = oldBills.map((b: any) => ({
      id: String(b.id ?? `cc_${Date.now()}`),
      name: String(b.name ?? ""),
      balance: Number(b.amount ?? 0) || 0,
      totalDue: Number(b.amount ?? 0) || 0,
      minDue: Number(b.amount ?? 0) || 0,
      dueDay: clamp(Number(b.dueDay ?? 1) || 1, 1, 31),
    }));
  }
  
  // Normalization...
  s.monthlyItems = (s.monthlyItems || []).map((m: any) => ({
    id: String(m.id ?? `monthly_${Date.now()}`),
    label: String(m.label ?? ""),
    amount: Number(m.amount ?? 0) || 0,
    dueDay: clamp(Number(m.dueDay ?? 1) || 1, 31),
  }));

  s.creditCards = (s.creditCards || []).map((c: any) => {
    const totalDue = Number(c.totalDue ?? 0) || 0;
    const bal = Number(c.balance ?? undefined) != null ? Number(c.balance) || 0 : totalDue;
    return {
      id: String(c.id ?? `cc_${Date.now()}`),
      name: String(c.name ?? ""),
      balance: Math.max(0, bal),
      totalDue,
      minDue: Number(c.minDue ?? 0) || 0,
      dueDay: clamp(Number(c.dueDay ?? 1) || 1, 31),
    };
  });
  
  s.allocations = (s.allocations || []).map((a: any) => ({ id: String(a.id), label: String(a.label), amount: Number(a.amount || 0) }));
  s.personalSpending = (s.personalSpending || []).map((p: any) => ({ id: String(p.id), label: String(p.label), amount: Number(p.amount || 0) }));
  if (typeof s.anchorISO !== "string") s.anchorISO = "";
  const okFreq: PayFrequency[] = ["weekly", "biweekly", "twice_monthly", "monthly"];
  if (!okFreq.includes(s.payFrequency)) s.payFrequency = "biweekly";

  return s as Settings;
}

// --- MAIN HOOK ---

export function usePayflow() {
  const [loaded, setLoaded] = useState(false);
  const [hasCompletedSetup, setHasCompletedSetup] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [checkedByCycle, setCheckedByCycle] = useState<Record<string, CheckedState>>({});
  const [appliedItemReductions, setAppliedItemReductions] = useState<Record<string, boolean>>({});
  const [unexpectedByCycle, setUnexpectedByCycle] = useState<Record<string, UnexpectedExpense[]>>({});
  const [cardPaymentsByCycle, setCardPaymentsByCycle] = useState<Record<string, CardPayment[]>>({});
  const [cycleOffset, setCycleOffset] = useState(0);

  const nowRef = useRef(new Date());
  const now = nowRef.current;
  const viewCycle = useMemo(() => getCycleWithOffset(settings, now, cycleOffset), [settings, cycleOffset, now]);

  const activeChecked = checkedByCycle[viewCycle.id] ?? {};
  const unexpected = unexpectedByCycle[viewCycle.id] ?? [];
  const payments = cardPaymentsByCycle[viewCycle.id] ?? [];

  const unexpectedTotal = useMemo(() => unexpected.reduce((sum, x) => sum + (x.amount || 0), 0), [unexpected]);
  const manualPaymentsTotal = useMemo(() => payments.reduce((sum, p) => sum + (p.amount || 0), 0), [payments]);
  const items = useMemo(() => buildChecklistForCycle(settings, viewCycle, unexpectedTotal, manualPaymentsTotal), [settings, viewCycle, unexpectedTotal, manualPaymentsTotal]);
  const grouped = useMemo(() => groupByCategory(items), [items]);
  const personalSpendingTotal = useMemo(() => (settings.personalSpending || []).reduce((sum, p) => sum + (p.amount || 0), 0), [settings.personalSpending]);

  const totals = useMemo(() => {
    const planned = items.reduce((sum, i) => sum + (i.amount || 0), 0);
    const done = items.reduce((sum, i) => (activeChecked[i.id]?.checked ? sum + (i.amount || 0) : sum), 0);
    const itemsTotal = items.length;
    const itemsDone = items.filter((i) => activeChecked[i.id]?.checked).length;
    const pct = itemsTotal ? Math.round((itemsDone / itemsTotal) * 100) : 0;
    return { planned, done, itemsTotal, itemsDone, pct };
  }, [items, activeChecked]);

  // Loader
  const loadFromStorage = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        setSettings(parsed?.settings ? migrateSettings(parsed.settings) : defaultSettings());
        setCheckedByCycle(parsed?.checkedByCycle ?? {});
        setAppliedItemReductions(parsed?.appliedItemReductions ?? {});
        setUnexpectedByCycle(parsed?.unexpectedByCycle ?? {});
        setCardPaymentsByCycle(parsed?.cardPaymentsByCycle ?? {});
        setHasCompletedSetup(!!parsed?.hasCompletedSetup);
      } else {
        setSettings(defaultSettings());
        setHasCompletedSetup(false);
      }
    } catch { }
  }, []);

  const reload = useCallback(async () => { await loadFromStorage(); }, [loadFromStorage]);
  useEffect(() => { (async () => { await loadFromStorage(); setLoaded(true); })(); }, [loadFromStorage]);

  // ✅ IMPROVEMENT: Debounced Save (waits 1000ms after last change)
  useEffect(() => {
    if (!loaded) return;
    
    const handler = setTimeout(() => {
      const data: Persisted = {
        hasCompletedSetup,
        settings,
        checkedByCycle,
        appliedItemReductions,
        activeCycleId: viewCycle.id,
        unexpectedByCycle,
        cardPaymentsByCycle,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
    }, 1000); // Wait 1 second

    return () => clearTimeout(handler);
  }, [
    loaded,
    hasCompletedSetup,
    settings,
    checkedByCycle,
    appliedItemReductions,
    unexpectedByCycle,
    cardPaymentsByCycle,
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

  // Reductions logic (unchanged)
  useEffect(() => {
    if (!loaded) return;
    if (!hasCompletedSetup) return;

    for (const it of items) {
      const checked = !!activeChecked[it.id]?.checked;
      if (!checked) continue;

      const key = `${viewCycle.id}:${it.id}`;
      const already = !!appliedItemReductions[key];
      if (already) continue;

      if (it.id.startsWith("cc_min_")) {
        const cardId = it.id.replace("cc_min_", "");
        setSettings((s) => ({
          ...s,
          creditCards: (s.creditCards || []).map((c) => {
            if (c.id !== cardId) return c;
            const newBal = Math.max(0, (c.balance || 0) - (c.minDue || 0));
            return { ...c, balance: newBal };
          }),
        }));
      }

      if (it.id === "debt_paydown") {
        const payAmount = it.amount || 0;
        setSettings((s) => ({
          ...s,
          debtRemaining: Math.max(0, (s.debtRemaining || 0) - payAmount),
        }));
      }

      setAppliedItemReductions((p) => ({ ...p, [key]: true }));
    }
  }, [loaded, hasCompletedSetup, items, activeChecked, appliedItemReductions, viewCycle.id]);

  const addUnexpected = (label: string, amountText: string, cardId?: string) => {
    const amt = safeParseNumber(amountText);
    if (amt <= 0) return false;
    const item: UnexpectedExpense = { id: `ux_${Date.now()}`, label: (label || "Unexpected expense").trim(), amount: amt, atISO: new Date().toISOString(), cardId: cardId || undefined };
    if (cardId) {
      setSettings((s) => ({ ...s, creditCards: (s.creditCards || []).map((c) => c.id === cardId ? { ...c, balance: (c.balance || 0) + amt } : c) }));
    }
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
      const list = prev[cycleId] ?? [];
      const item = list.find((x) => x.id === id);
      if (!item) return prev;
      if (item.cardId) {
        setSettings((s) => ({
          ...s,
          creditCards: (s.creditCards || []).map((c) => c.id === item.cardId ? { ...c, balance: Math.max(0, (c.balance || 0) - (item.amount || 0)) } : c),
        }));
      }
      return { ...prev, [cycleId]: list.filter((x) => x.id !== id) };
    });
  };

  const addCardPayment = (cardId: string, amountText: string) => {
    const amt = safeParseNumber(amountText);
    if (amt <= 0) return false;
    const card = (settings.creditCards || []).find((c) => c.id === cardId);
    if (!card) return false;
    if ((card.balance || 0) <= 0) return false;
    const actual = Math.min(amt, card.balance || 0);
    const payment: CardPayment = { id: `ccpay_${Date.now()}`, cardId, amount: actual, atISO: new Date().toISOString() };
    setSettings((s) => ({
      ...s,
      creditCards: (s.creditCards || []).map((c) => c.id === cardId ? { ...c, balance: Math.max(0, (c.balance || 0) - actual) } : c),
    }));
    setCardPaymentsByCycle((prev) => {
      const next = { ...prev };
      const arr = [...(next[viewCycle.id] ?? [])];
      arr.unshift(payment);
      next[viewCycle.id] = arr;
      return next;
    });
    return true;
  };

  const removeCardPayment = (cycleId: string, paymentId: string) => {
    setCardPaymentsByCycle((prev) => {
      const list = prev[cycleId] ?? [];
      const payment = list.find((p) => p.id === paymentId);
      if (!payment) return prev;
      setSettings((s) => ({
        ...s,
        creditCards: (s.creditCards || []).map((c) => c.id === payment.cardId ? { ...c, balance: (c.balance || 0) + (payment.amount || 0) } : c),
      }));
      return { ...prev, [cycleId]: list.filter((p) => p.id !== paymentId) };
    });
  };

  const resetEverything = async () => {
    setSettings(defaultSettings());
    setCheckedByCycle({});
    setAppliedItemReductions({});
    setUnexpectedByCycle({});
    setCardPaymentsByCycle({});
    setHasCompletedSetup(false);
    setCycleOffset(0);
    try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const last10Cycles = useMemo(() => (hasCompletedSetup ? getLastNCycles(settings, new Date(), 10) : []), [settings, hasCompletedSetup]);
  const getCycleUnexpectedTotal = (cycleId: string) => (unexpectedByCycle[cycleId] ?? []).reduce((sum, x) => sum + (x.amount || 0), 0);
  const getCycleChecked = (cycleId: string) => checkedByCycle[cycleId] ?? {};
  const getCycleCardPayments = (cycleId: string) => cardPaymentsByCycle[cycleId] ?? [];

  return {
    loaded,
    hasCompletedSetup,
    setHasCompletedSetup,
    settings,
    setSettings,
    reload,
    cycleOffset,
    setCycleOffset,
    viewCycle,
    items,
    grouped,
    activeChecked,
    totals,
    toggleItem,
    resetEverything,
    unexpected,
    unexpectedTotal,
    addUnexpected,
    removeUnexpected,
    payments,
    manualPaymentsTotal,
    addCardPayment,
    removeCardPayment,
    getCycleCardPayments,
    personalSpendingTotal,
    last10Cycles,
    getCycleUnexpectedTotal,
    getCycleChecked,
  };
}