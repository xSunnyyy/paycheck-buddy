import { Bill, MonthlyExpense, PayFrequency, Profile } from "./types";

export type ChecklistItem = {
  id: string;
  label: string;
  amount: number;
  notes?: string;
  category: "Bills" | "Monthly" | "Savings" | "Investing" | "Fuel" | "Debt";
};

// ---- date helpers
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toISODate(d: Date) {
  return startOfDay(d).toISOString();
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// ---- schedule: produce the "current/next payday" based on settings
export function getPaydayForNow(profile: Profile, now = new Date()): Date {
  const n = startOfDay(now);

  if (profile.frequency === "weekly" || profile.frequency === "biweekly") {
    // anchor with nextPaydayISO, step backwards until <= now, then step forward one interval if needed
    const anchor = startOfDay(new Date(profile.nextPaydayISO));
    const stepDays = profile.frequency === "weekly" ? 7 : 14;

    // Move anchor backward until it's not after now
    let p = new Date(anchor);
    while (p.getTime() > n.getTime()) {
      p.setDate(p.getDate() - stepDays);
    }
    // Move forward until next would be after now (so p is the latest payday <= now)
    while (true) {
      const next = new Date(p);
      next.setDate(next.getDate() + stepDays);
      if (next.getTime() <= n.getTime()) p = next;
      else break;
    }
    return p;
  }

  if (profile.frequency === "semimonthly") {
    const y = n.getFullYear();
    const m = n.getMonth();
    const last = daysInMonth(y, m);

    const d1 = clamp(profile.semiMonthlyDay1 || 1, 1, last);
    const d2 = clamp(profile.semiMonthlyDay2 || 15, 1, last);

    const a = startOfDay(new Date(y, m, d1));
    const b = startOfDay(new Date(y, m, d2));

    const dates = [a, b].sort((x, z) => x.getTime() - z.getTime());

    // latest payday <= now in this month, else last payday from previous month
    if (dates[1].getTime() <= n.getTime()) return dates[1];
    if (dates[0].getTime() <= n.getTime()) return dates[0];

    // previous month second payday
    const pm = new Date(y, m - 1, 1);
    const py = pm.getFullYear();
    const pmo = pm.getMonth();
    const plast = daysInMonth(py, pmo);
    const pd1 = clamp(profile.semiMonthlyDay1 || 1, 1, plast);
    const pd2 = clamp(profile.semiMonthlyDay2 || 15, 1, plast);
    const pa = startOfDay(new Date(py, pmo, pd1));
    const pb = startOfDay(new Date(py, pmo, pd2));
    return [pa, pb].sort((x, z) => x.getTime() - z.getTime())[1];
  }

  // monthly
  const y = n.getFullYear();
  const m = n.getMonth();
  const last = daysInMonth(y, m);
  const day = clamp(profile.monthlyPaydayDay || 1, 1, last);
  const thisMonthPay = startOfDay(new Date(y, m, day));
  if (thisMonthPay.getTime() <= n.getTime()) return thisMonthPay;

  // previous month
  const pm = new Date(y, m - 1, 1);
  const py = pm.getFullYear();
  const pmo = pm.getMonth();
  const plast = daysInMonth(py, pmo);
  const pday = clamp(profile.monthlyPaydayDay || 1, 1, plast);
  return startOfDay(new Date(py, pmo, pday));
}

export function getNextPayday(profile: Profile, payday: Date): Date {
  const p = startOfDay(payday);

  if (profile.frequency === "weekly") {
    const n = new Date(p);
    n.setDate(n.getDate() + 7);
    return n;
  }
  if (profile.frequency === "biweekly") {
    const n = new Date(p);
    n.setDate(n.getDate() + 14);
    return n;
  }
  if (profile.frequency === "semimonthly") {
    const y = p.getFullYear();
    const m = p.getMonth();
    const last = daysInMonth(y, m);
    const d1 = clamp(profile.semiMonthlyDay1 || 1, 1, last);
    const d2 = clamp(profile.semiMonthlyDay2 || 15, 1, last);
    const a = startOfDay(new Date(y, m, d1));
    const b = startOfDay(new Date(y, m, d2));
    const dates = [a, b].sort((x, z) => x.getTime() - z.getTime());
    if (p.getTime() === dates[0].getTime()) return dates[1];

    // go to next month day1
    const nm = new Date(y, m + 1, 1);
    const ny = nm.getFullYear();
    const nmo = nm.getMonth();
    const nlast = daysInMonth(ny, nmo);
    const nd1 = clamp(profile.semiMonthlyDay1 || 1, 1, nlast);
    return startOfDay(new Date(ny, nmo, nd1));
  }

  // monthly -> next month same day
  const nm = new Date(p.getFullYear(), p.getMonth() + 1, 1);
  const ny = nm.getFullYear();
  const nmo = nm.getMonth();
  const nlast = daysInMonth(ny, nmo);
  const day = clamp(profile.monthlyPaydayDay || 1, 1, nlast);
  return startOfDay(new Date(ny, nmo, day));
}

// How many paychecks occur in the month of `payday` (for monthly expenses splitting)
export function countPaydaysInMonth(profile: Profile, payday: Date): number {
  const start = startOfDay(new Date(payday.getFullYear(), payday.getMonth(), 1));
  const end = startOfDay(new Date(payday.getFullYear(), payday.getMonth() + 1, 1));

  // Find first payday that is >= start, by walking back from "payday for now" logic:
  // easiest: step through from a known payday in/near month and count those in range.
  let p = startOfDay(getPaydayForNow(profile, start));
  // ensure p is >= start
  while (p.getTime() < start.getTime()) p = getNextPayday(profile, p);
  // now count until end
  let count = 0;
  while (p.getTime() < end.getTime()) {
    count++;
    p = getNextPayday(profile, p);
  }
  return Math.max(1, count);
}

// Assign each bill to the paycheck that occurs most recently on/before its due date for that month.
export function billLandsOnThisPayday(profile: Profile, bill: Bill, payday: Date): boolean {
  const p = startOfDay(payday);
  const year = p.getFullYear();
  const month = p.getMonth();
  const last = daysInMonth(year, month);
  const dueDay = clamp(bill.dueDay, 1, last);
  const dueDate = startOfDay(new Date(year, month, dueDay));

  // find last payday <= dueDate
  let lastPay = startOfDay(getPaydayForNow(profile, dueDate));
  while (getNextPayday(profile, lastPay).getTime() <= dueDate.getTime()) {
    lastPay = getNextPayday(profile, lastPay);
  }
  return lastPay.getTime() === p.getTime();
}

export function buildChecklistForPayday(
  profile: Profile,
  bills: Bill[],
  monthlyExpenses: MonthlyExpense[],
  payday: Date,
  debtBalance: number
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const p = startOfDay(payday);

  // Bills that land on this payday
  for (const b of bills) {
    if (billLandsOnThisPayday(profile, b, p)) {
      items.push({
        id: `bill_${b.id}_${toISODate(p)}`,
        label: b.name,
        amount: b.amount,
        notes: `Due day ${b.dueDay}`,
        category: "Bills",
      });
    }
  }

  // Monthly expenses as ONE combined item (split across paychecks in that month)
  const monthlyTotal = monthlyExpenses.reduce((sum, m) => sum + (m.amount || 0), 0);
  if (monthlyTotal > 0) {
    const paydaysInMonth = countPaydaysInMonth(profile, p);
    const perPay = monthlyTotal / paydaysInMonth;
    const topCats = monthlyExpenses
      .slice()
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .slice(0, 3)
      .map((x) => `${x.category}: $${Math.round(x.amount)}`);

    items.push({
      id: `monthly_${toISODate(p)}`,
      label: "Monthly expenses",
      amount: Math.round(perPay * 100) / 100,
      notes:
        monthlyExpenses.length > 0
          ? `Split across ${paydaysInMonth} paychecks • ${topCats.join(" • ")}`
          : `Split across ${paydaysInMonth} paychecks`,
      category: "Monthly",
    });
  }

  // Optional allocations
  if (profile.savingsPerPaycheck > 0) {
    items.push({
      id: `save_${toISODate(p)}`,
      label: "Transfer to Savings",
      amount: profile.savingsPerPaycheck,
      notes: "Per paycheck",
      category: "Savings",
    });
  }
  if (profile.investingPerPaycheck > 0) {
    items.push({
      id: `inv_${toISODate(p)}`,
      label: "Investing",
      amount: profile.investingPerPaycheck,
      notes: "Per paycheck",
      category: "Investing",
    });
  }
  if (profile.fuelPerPaycheck > 0) {
    items.push({
      id: `fuel_${toISODate(p)}`,
      label: "Fuel / Variable",
      amount: profile.fuelPerPaycheck,
      notes: "Per paycheck",
      category: "Fuel",
    });
  }

  // Debt paydown (auto = paycheck - everything else)
  const nonDebt = items.reduce((sum, i) => sum + i.amount, 0);
  const computedDebt = Math.max(0, profile.payPerPaycheck - nonDebt);
  const debtPay = Math.min(debtBalance, computedDebt);

  items.push({
    id: `debt_${toISODate(p)}`,
    label: "Debt Paydown",
    amount: debtPay,
    notes: debtBalance <= 0 ? "Paid off 🎉" : "Auto-calculated",
    category: "Debt",
  });

  return items;
}
