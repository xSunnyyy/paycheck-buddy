import React, { useMemo, useState } from "react";
import { ScrollView, Text, TextInput, View, Pressable, Alert } from "react-native";
import Card from "../components/Card";
import { useStore } from "../Store";
import { Bill, MonthlyExpense, PayFrequency, Profile } from "../types";

function id() {
  return Math.random().toString(36).slice(2, 10);
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

export default function SetupScreen({ navigation }: any) {
  const { state, dispatch } = useStore();

  const existing = state.profile;

  const [frequency, setFrequency] = useState<PayFrequency>(existing?.frequency ?? "biweekly");
  const [payPerPaycheck, setPayPerPaycheck] = useState<string>(String(existing?.payPerPaycheck ?? 3313));

  const [nextPaydayISO, setNextPaydayISO] = useState<string>(
    existing?.nextPaydayISO ?? new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"
  );

  const [semi1, setSemi1] = useState<string>(String(existing?.semiMonthlyDay1 ?? 1));
  const [semi2, setSemi2] = useState<string>(String(existing?.semiMonthlyDay2 ?? 15));
  const [monthlyDay, setMonthlyDay] = useState<string>(String(existing?.monthlyPaydayDay ?? 1));

  const [savings, setSavings] = useState<string>(String(existing?.savingsPerPaycheck ?? 500));
  const [investing, setInvesting] = useState<string>(String(existing?.investingPerPaycheck ?? 200));
  const [fuel, setFuel] = useState<string>(String(existing?.fuelPerPaycheck ?? 500));

  const [startingDebt, setStartingDebt] = useState<string>(String(existing?.startingDebt ?? 33300));

  const [bills, setBills] = useState<Bill[]>(state.bills.length ? state.bills : []);
  const [billName, setBillName] = useState("");
  const [billAmt, setBillAmt] = useState("");
  const [billDue, setBillDue] = useState("");

  const [monthly, setMonthly] = useState<MonthlyExpense[]>(state.monthlyExpenses.length ? state.monthlyExpenses : []);
  const [mCat, setMCat] = useState("");
  const [mAmt, setMAmt] = useState("");

  const monthlyTotal = useMemo(() => monthly.reduce((s, m) => s + (m.amount || 0), 0), [monthly]);

  function addBill() {
    const name = billName.trim();
    const amount = Number(billAmt);
    const dueDay = Number(billDue);
    if (!name || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) {
      Alert.alert("Bill invalid", "Enter a name, amount, and due day (1–31).");
      return;
    }
    setBills((prev) => [...prev, { id: id(), name, amount, dueDay }]);
    setBillName("");
    setBillAmt("");
    setBillDue("");
  }

  function addMonthly() {
    const cat = mCat.trim();
    const amount = Number(mAmt);
    if (!cat || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Monthly expense invalid", "Enter a category and monthly amount.");
      return;
    }
    setMonthly((prev) => [...prev, { id: id(), category: cat, amount }]);
    setMCat("");
    setMAmt("");
  }

  function save() {
    const pay = Number(payPerPaycheck);
    const s = Number(savings);
    const i = Number(investing);
    const f = Number(fuel);
    const debt = Number(startingDebt);

    if (!Number.isFinite(pay) || pay <= 0) return Alert.alert("Income invalid", "Pay per paycheck must be > 0.");
    if (![s, i, f].every((x) => Number.isFinite(x) && x >= 0))
      return Alert.alert("Allocations invalid", "Savings/Investing/Fuel must be 0 or more.");
    if (!Number.isFinite(debt) || debt < 0) return Alert.alert("Debt invalid", "Debt must be 0 or more.");

    const profile: Profile = {
      isConfigured: true,
      payPerPaycheck: pay,
      frequency,
      nextPaydayISO,
      semiMonthlyDay1: Math.max(1, Math.min(31, Number(semi1) || 1)),
      semiMonthlyDay2: Math.max(1, Math.min(31, Number(semi2) || 15)),
      monthlyPaydayDay: Math.max(1, Math.min(31, Number(monthlyDay) || 1)),
      savingsPerPaycheck: s,
      investingPerPaycheck: i,
      fuelPerPaycheck: f,
      startingDebt: debt,
    };

    dispatch({ type: "SET_PROFILE", profile });
    dispatch({ type: "SET_BILLS", bills });
    dispatch({ type: "SET_MONTHLY", monthly });

    // set active payday to "current" payday now
    dispatch({ type: "ARCHIVE_IF_NEEDED" });

    // If they came from settings, go back; otherwise it will show Home automatically.
    navigation.goBack?.();
  }

  const Seg = ({ label, active, onPress }: any) => (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: active ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.06)",
      }}
    >
      <Text style={{ color: "rgba(244,245,247,0.95)", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );

  const Field = ({ label, value, setValue, placeholder, keyboardType = "default" }: any) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: "rgba(185,193,204,0.82)", fontWeight: "700" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={"rgba(185,193,204,0.45)"}
        keyboardType={keyboardType}
        style={{
          color: "rgba(244,245,247,0.95)",
          padding: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.05)",
        }}
      />
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#070A10" }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Card>
        <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>Pay schedule</Text>
        <View style={{ height: 10 }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Seg label="Weekly" active={frequency === "weekly"} onPress={() => setFrequency("weekly")} />
          <Seg label="Bi-weekly" active={frequency === "biweekly"} onPress={() => setFrequency("biweekly")} />
          <Seg label="Semi-monthly" active={frequency === "semimonthly"} onPress={() => setFrequency("semimonthly")} />
          <Seg label="Monthly" active={frequency === "monthly"} onPress={() => setFrequency("monthly")} />
        </View>

        <View style={{ height: 14 }} />
        <Field
          label="Net pay per paycheck"
          value={payPerPaycheck}
          setValue={setPayPerPaycheck}
          placeholder="3313"
          keyboardType="numeric"
        />

        <View style={{ height: 14 }} />
        {(frequency === "weekly" || frequency === "biweekly") && (
          <Field
            label="Next payday ISO (quick input)"
            value={nextPaydayISO}
            setValue={setNextPaydayISO}
            placeholder="2026-01-09T00:00:00.000Z"
          />
        )}

        {frequency === "semimonthly" && (
          <View style={{ gap: 12 }}>
            <Field label="Payday day #1 (1–31)" value={semi1} setValue={setSemi1} placeholder="1" keyboardType="numeric" />
            <Field label="Payday day #2 (1–31)" value={semi2} setValue={setSemi2} placeholder="15" keyboardType="numeric" />
          </View>
        )}

        {frequency === "monthly" && (
          <Field
            label="Payday day of month (1–31)"
            value={monthlyDay}
            setValue={setMonthlyDay}
            placeholder="1"
            keyboardType="numeric"
          />
        )}
      </Card>

      <Card>
        <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>Allocations (per paycheck)</Text>
        <View style={{ height: 10 }} />
        <View style={{ gap: 12 }}>
          <Field label="Savings" value={savings} setValue={setSavings} placeholder="500" keyboardType="numeric" />
          <Field label="Investing" value={investing} setValue={setInvesting} placeholder="200" keyboardType="numeric" />
          <Field label="Fuel / Variable" value={fuel} setValue={setFuel} placeholder="500" keyboardType="numeric" />
        </View>
      </Card>

      <Card>
        <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>Debt</Text>
        <View style={{ height: 10 }} />
        <Field label="Starting total debt balance" value={startingDebt} setValue={setStartingDebt} placeholder="33300" keyboardType="numeric" />
      </Card>

      <Card>
        <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>Bills (monthly due day)</Text>
        <View style={{ height: 10 }} />

        <View style={{ gap: 10 }}>
          <Field label="Bill name" value={billName} setValue={setBillName} placeholder="Verizon" />
          <Field label="Bill amount" value={billAmt} setValue={setBillAmt} placeholder="95" keyboardType="numeric" />
          <Field label="Due day (1–31)" value={billDue} setValue={setBillDue} placeholder="25" keyboardType="numeric" />
          <Pressable
            onPress={addBill}
            style={{ padding: 12, borderRadius: 14, backgroundColor: "rgba(34,197,94,0.18)", borderWidth: 1, borderColor: "rgba(34,197,94,0.30)" }}
          >
            <Text style={{ color: "rgba(236,253,245,1)", fontWeight: "900", textAlign: "center" }}>Add bill</Text>
          </Pressable>
        </View>

        <View style={{ height: 12 }} />
        <View style={{ gap: 8 }}>
          {bills.map((b) => (
            <View key={b.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: "rgba(244,245,247,0.95)", fontWeight: "800", flex: 1 }}>
                {b.name} • {money(b.amount)} • due {b.dueDay}
              </Text>
              <Pressable onPress={() => setBills((prev) => prev.filter((x) => x.id !== b.id))}>
                <Text style={{ color: "rgba(248,113,113,0.9)", fontWeight: "900" }}>Delete</Text>
              </Pressable>
            </View>
          ))}
          {bills.length === 0 && <Text style={{ color: "rgba(185,193,204,0.70)" }}>No bills yet.</Text>}
        </View>
      </Card>

      <Card>
        <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>Monthly expenses (by category)</Text>
        <Text style={{ color: "rgba(185,193,204,0.82)", marginTop: 6, fontWeight: "700" }}>
          You can add categories, but the checklist shows ONE combined “Monthly expenses” item.
        </Text>

        <View style={{ height: 12 }} />
        <View style={{ gap: 10 }}>
          <Field label="Category" value={mCat} setValue={setMCat} placeholder="Groceries" />
          <Field label="Monthly amount" value={mAmt} setValue={setMAmt} placeholder="600" keyboardType="numeric" />
          <Pressable
            onPress={addMonthly}
            style={{ padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
          >
            <Text style={{ color: "rgba(244,245,247,0.95)", fontWeight: "900", textAlign: "center" }}>Add monthly expense</Text>
          </Pressable>
        </View>

        <View style={{ height: 12 }} />
        <Text style={{ color: "rgba(236,253,245,1)", fontWeight: "900" }}>Monthly total: {money(monthlyTotal)}</Text>

        <View style={{ height: 10 }} />
        <View style={{ gap: 8 }}>
          {monthly.map((m) => (
            <View key={m.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: "rgba(244,245,247,0.95)", fontWeight: "800", flex: 1 }}>
                {m.category} • {money(m.amount)}
              </Text>
              <Pressable onPress={() => setMonthly((prev) => prev.filter((x) => x.id !== m.id))}>
                <Text style={{ color: "rgba(248,113,113,0.9)", fontWeight: "900" }}>Delete</Text>
              </Pressable>
            </View>
          ))}
          {monthly.length === 0 && <Text style={{ color: "rgba(185,193,204,0.70)" }}>No monthly expenses yet.</Text>}
        </View>
      </Card>

      <Pressable
        onPress={save}
        style={{
          padding: 14,
          borderRadius: 16,
          backgroundColor: "rgba(34,197,94,0.20)",
          borderWidth: 1,
          borderColor: "rgba(34,197,94,0.35)",
        }}
      >
        <Text style={{ color: "rgba(236,253,245,1)", fontWeight: "950", textAlign: "center", fontSize: 16 }}>
          Save & Continue
        </Text>
      </Pressable>

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}
