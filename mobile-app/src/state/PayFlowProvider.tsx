// src/state/PayFlowProvider.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// IMPORTANT: match your existing key
const STORAGE_KEY = "payflow_mobile_v1";

type PayFrequency = "weekly" | "biweekly" | "twice_monthly" | "monthly";

export type Bill = { id: string; name: string; amount: number; dueDay: number };
export type MonthlyItem = { id: string; label: string; amount: number; dueDay: number };
export type Allocation = { id: string; label: string; amount: number };
export type PersonalSpendingItem = { id: string; label: string; amount: number };

export type Settings = {
  payFrequency: PayFrequency;
  payAmount: number;
  anchorISO: string;
  twiceMonthlyDay1: number;
  twiceMonthlyDay2: number;
  monthlyPayDay: number;
  bills: Bill[];
  monthlyItems: MonthlyItem[];
  allocations: Allocation[];
  personalSpending: PersonalSpendingItem[];
  debtRemaining: number;
};

export type CheckedState = Record<string, { checked: boolean; at?: string }>;

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
  appliedDebtCycles: Record<string, boolean>;
  activeCycleId?: string;
  unexpectedByCycle?: Record<string, UnexpectedExpense[]>;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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

// ✅ keep this simple; you can paste your full migrateSettings if you already have it
function migrateSettings(raw: any): Settings {
  const base = defaultSettings();
  const s: any = { ...base, ...(raw || {}) };

  if (!Array.isArray(s.bills)) s.bills = [];
  if (!Array.isArray(s.monthlyItems)) s.monthlyItems = [];
  if (!Array.isArray(s.allocations)) s.allocations = [];
  if (!Array.isArray(s.personalSpending)) s.personalSpending = [];

  s.bills = s.bills.map((b: any) => ({
    id: String(b.id ?? `bill_${Date.now()}`),
    name: String(b.name ?? ""),
    amount: Number(b.amount ?? 0) || 0,
    dueDay: clamp(Number(b.dueDay ?? 1) || 1, 1, 31),
  }));

  s.monthlyItems = s.monthlyItems.map((m: any) => ({
    id: String(m.id ?? `monthly_${Date.now()}`),
    label: String(m.label ?? ""),
    amount: Number(m.amount ?? 0) || 0,
    dueDay: clamp(Number(m.dueDay ?? 1) || 1, 1, 31),
  }));

  s.allocations = s.allocations.map((a: any) => ({
    id: String(a.id ?? `alloc_${Date.now()}`),
    label: String(a.label ?? ""),
    amount: Number(a.amount ?? 0) || 0,
  }));

  s.personalSpending = s.personalSpending.map((p: any) => ({
    id: String(p.id ?? `ps_${Date.now()}`),
    label: String(p.label ?? ""),
    amount: Number(p.amount ?? 0) || 0,
  }));

  return s as Settings;
}

type PayFlowContextValue = {
  loaded: boolean;
  hasCompletedSetup: boolean;
  setHasCompletedSetup: (v: boolean) => void;

  settings: Settings;
  setSettings: (s: Settings) => void;

  checkedByCycle: Record<string, CheckedState>;
  setCheckedByCycle: React.Dispatch<React.SetStateAction<Record<string, CheckedState>>>;

  appliedDebtCycles: Record<string, boolean>;
  setAppliedDebtCycles: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;

  unexpectedByCycle: Record<string, UnexpectedExpense[]>;
  setUnexpectedByCycle: React.Dispatch<React.SetStateAction<Record<string, UnexpectedExpense[]>>>;
};

const Ctx = createContext<PayFlowContextValue | null>(null);

export function PayFlowProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);

  const [hasCompletedSetup, setHasCompletedSetup] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [checkedByCycle, setCheckedByCycle] = useState<Record<string, CheckedState>>({});
  const [appliedDebtCycles, setAppliedDebtCycles] = useState<Record<string, boolean>>({});
  const [unexpectedByCycle, setUnexpectedByCycle] = useState<Record<string, UnexpectedExpense[]>>({});

  // Load once (global)
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
        // ignore, keep defaults
      }
      setLoaded(true);
    })();
  }, []);

  // Persist (global)
  useEffect(() => {
    if (!loaded) return;

    const data: Persisted = {
      hasCompletedSetup,
      settings,
      checkedByCycle,
      appliedDebtCycles,
      unexpectedByCycle,
    };

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [loaded, hasCompletedSetup, settings, checkedByCycle, appliedDebtCycles, unexpectedByCycle]);

  const value = useMemo<PayFlowContextValue>(
    () => ({
      loaded,
      hasCompletedSetup,
      setHasCompletedSetup,
      settings,
      setSettings,
      checkedByCycle,
      setCheckedByCycle,
      appliedDebtCycles,
      setAppliedDebtCycles,
      unexpectedByCycle,
      setUnexpectedByCycle,
    }),
    [loaded, hasCompletedSetup, settings, checkedByCycle, appliedDebtCycles, unexpectedByCycle]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePayflow() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePayflow must be used inside PayFlowProvider");
  return v;
}
