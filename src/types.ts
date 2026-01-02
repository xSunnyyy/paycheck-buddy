export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

export type Bill = {
  id: string;
  name: string;
  amount: number;
  dueDay: number; // 1-31
};

export type MonthlyExpense = {
  id: string;
  category: string; // user picks label
  amount: number; // monthly
};

export type Profile = {
  isConfigured: boolean;

  // income
  payPerPaycheck: number; // net per paycheck (simple + accurate)
  frequency: PayFrequency;

  // anchors
  nextPaydayISO: string; // used for weekly/biweekly schedule
  semiMonthlyDay1: number; // default 1
  semiMonthlyDay2: number; // default 15
  monthlyPaydayDay: number; // default 1

  // allocations (optional but helpful)
  savingsPerPaycheck: number;
  investingPerPaycheck: number;
  fuelPerPaycheck: number;

  // debt
  startingDebt: number;
};

export type CheckedState = Record<string, { checked: boolean; at?: string }>;

export type HistoryEntry = {
  cycleKey: string; // unique ID for the paycheck occurrence
  paydayISO: string;
  savedAtISO: string;
  checked: CheckedState;

  totals: {
    planned: number;
    done: number;
    pct: number;
    itemsDone: number;
    itemsTotal: number;
    debtPaid: number;
  };
};

export type AppState = {
  booting: boolean;

  profile: Profile | null;
  bills: Bill[];
  monthlyExpenses: MonthlyExpense[];

  // today state
  activePaydayISO: string; // which paycheck "today view" is pointing to
  checkedByPayday: Record<string, CheckedState>; // paydayISO -> checked state

  // running debt
  debtBalance: number;

  // history
  history: HistoryEntry[];
};
