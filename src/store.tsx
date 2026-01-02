import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { AppState, Bill, HistoryEntry, MonthlyExpense, Profile, CheckedState } from "./types";
import { loadStorage, saveStorage } from "./storage";
import { buildChecklistForPayday, getPaydayForNow, getNextPayday } from "./budget";

type Action =
  | { type: "BOOT_DONE"; payload: AppState }
  | { type: "SET_PROFILE"; profile: Profile }
  | { type: "SET_BILLS"; bills: Bill[] }
  | { type: "SET_MONTHLY"; monthly: MonthlyExpense[] }
  | { type: "SET_CHECKED"; paydayISO: string; checked: CheckedState }
  | { type: "SET_ACTIVE_PAYDAY"; paydayISO: string }
  | { type: "ARCHIVE_IF_NEEDED" }
  | { type: "RESET_ALL" }
  | { type: "MANUAL_SET_DEBT"; debtBalance: number };

const initialState: AppState = {
  booting: true,
  profile: null,
  bills: [],
  monthlyExpenses: [],
  activePaydayISO: new Date().toISOString(),
  checkedByPayday: {},
  debtBalance: 0,
  history: [],
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "BOOT_DONE":
      return action.payload;

    case "SET_PROFILE": {
      // initialize debt balance if needed
      const nextDebt = state.debtBalance > 0 ? state.debtBalance : action.profile.startingDebt;
      return { ...state, profile: action.profile, debtBalance: nextDebt };
    }

    case "SET_BILLS":
      return { ...state, bills: action.bills };

    case "SET_MONTHLY":
      return { ...state, monthlyExpenses: action.monthly };

    case "SET_ACTIVE_PAYDAY":
      return { ...state, activePaydayISO: action.paydayISO };

    case "SET_CHECKED": {
      const checkedByPayday = { ...state.checkedByPayday, [action.paydayISO]: action.checked };
      return { ...state, checkedByPayday };
    }

    case "MANUAL_SET_DEBT":
      return { ...state, debtBalance: Math.max(0, action.debtBalance) };

    case "ARCHIVE_IF_NEEDED": {
      if (!state.profile) return state;

      const now = new Date();
      const currentPayday = getPaydayForNow(state.profile, now);
      const currentPaydayISO = currentPayday.toISOString();

      // If active payday differs from current payday, we need to archive the old payday
      const lastPaydayISO = state.activePaydayISO;
      if (!lastPaydayISO) {
        return { ...state, activePaydayISO: currentPaydayISO };
      }
      if (lastPaydayISO === currentPaydayISO) return state;

      // Archive last payday
      const lastPayday = new Date(lastPaydayISO);
      const checked = state.checkedByPayday[lastPaydayISO] ?? {};

      const items = buildChecklistForPayday(
        state.profile,
        state.bills,
        state.monthlyExpenses,
        lastPayday,
        state.debtBalance
      );

      const planned = items.reduce((s, i) => s + i.amount, 0);
      const done = items.reduce((s, i) => (checked[i.id]?.checked ? s + i.amount : s), 0);
      const itemsTotal = items.length;
      const itemsDone = items.filter((i) => checked[i.id]?.checked).length;
      const pct = itemsTotal ? Math.round((itemsDone / itemsTotal) * 100) : 0;

      const debtItem = items.find((i) => i.category === "Debt");
      const debtPaid = debtItem && checked[debtItem.id]?.checked ? debtItem.amount : 0;

      const entry: HistoryEntry = {
        cycleKey: lastPaydayISO,
        paydayISO: lastPaydayISO,
        savedAtISO: new Date().toISOString(),
        checked,
        totals: { planned, done, pct, itemsDone, itemsTotal, debtPaid },
      };

      const mergedHistory = [entry, ...state.history.filter((h) => h.cycleKey !== entry.cycleKey)]
        .sort((a, b) => new Date(b.paydayISO).getTime() - new Date(a.paydayISO).getTime())
        .slice(0, 104);

      // Decrease debt balance only if the Debt item was checked
      const newDebtBalance = Math.max(0, state.debtBalance - debtPaid);

      // Reset checked for new payday
      const checkedByPayday = { ...state.checkedByPayday };
      checkedByPayday[currentPaydayISO] = checkedByPayday[currentPaydayISO] ?? {};

      return {
        ...state,
        history: mergedHistory,
        debtBalance: newDebtBalance,
        activePaydayISO: currentPaydayISO,
        checkedByPayday,
      };
    }

    case "RESET_ALL":
      return {
        ...initialState,
        booting: false,
        profile: state.profile ? { ...state.profile, isConfigured: false } : null,
      };

    default:
      return state;
  }
}

type Ctx = {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  // helpers
  getChecklist: (paydayISO?: string) => ReturnType<typeof buildChecklistForPayday>;
};

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // boot
  useEffect(() => {
    (async () => {
      const saved = await loadStorage<AppState>();
      if (saved && saved.profile) {
        dispatch({ type: "BOOT_DONE", payload: { ...saved, booting: false } });
      } else {
        dispatch({ type: "BOOT_DONE", payload: { ...initialState, booting: false } });
      }
    })();
  }, []);

  // persist
  useEffect(() => {
    if (state.booting) return;
    saveStorage(state).catch(() => {});
  }, [state]);

  // auto archive when payday rolls over (checks on app load + whenever profile exists)
  useEffect(() => {
    if (state.booting) return;
    if (!state.profile?.isConfigured) return;
    dispatch({ type: "ARCHIVE_IF_NEEDED" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.booting, state.profile?.isConfigured]);

  const getChecklist = (paydayISO?: string) => {
    if (!state.profile) return [];
    const iso = paydayISO ?? state.activePaydayISO;
    const payday = new Date(iso);
    return buildChecklistForPayday(state.profile, state.bills, state.monthlyExpenses, payday, state.debtBalance);
  };

  const value = useMemo(() => ({ state, dispatch, getChecklist }), [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
