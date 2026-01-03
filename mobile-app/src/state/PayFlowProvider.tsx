// src/state/PayFlowProvider.tsx
import React, { createContext, useContext } from "react";
import { usePayflow as usePayflowStore } from "@/src/state/usePayflow";

// The provider holds ONE instance of the payflow store for the whole app.
type PayflowValue = ReturnType<typeof usePayflowStore>;

const Ctx = createContext<PayflowValue | null>(null);

export function PayFlowProvider({ children }: { children: React.ReactNode }) {
  const value = usePayflowStore();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePayflow() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePayflow must be used inside PayFlowProvider");
  return v;
}
