// src/state/PayFlowProvider.tsx
import React, { createContext, useContext, useMemo } from "react";

// IMPORTANT:
// This Provider should NOT persist anything itself.
// The real store + persistence lives in src/state/usePayflow.ts.
import { usePayflow as usePayflowStore } from "@/src/state/usePayflow";

type PayFlowContextValue = ReturnType<typeof usePayflowStore>;

const Ctx = createContext<PayFlowContextValue | null>(null);

export function PayFlowProvider({ children }: { children: React.ReactNode }) {
  // ✅ single source of truth store instance
  const store = usePayflowStore();

  // memo not strictly required, but avoids needless rerenders
  const value = useMemo(() => store, [store]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePayflow() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePayflow must be used inside PayFlowProvider");
  return v;
}
