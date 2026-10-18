import type { PosProduct } from "@steward/data";
import { create } from "zustand";

/**
 * The POS cart: what the cashier has picked, before it becomes a sale.
 * Totals are never stored here; the screen computes them with the domain package.
 */
export interface CartLine {
  productId: string;
  name: string;
  genericName: string;
  sku: string;
  priceCentavos: number;
  isTaxable: boolean;
  qty: number;
  /** Sellable on hand when the product was last seen; the cart never goes above it. */
  max: number;
}

export type PaymentMethod = "cash" | "gcash";

interface CartState {
  branchId: string | null;
  lines: CartLine[];
  discountId: string | null;
  payment: PaymentMethod;
  cashInput: string;
  gcashInput: string;
  /** Adds one unit. Returns false when stock would run out. */
  add: (branchId: string, product: PosProduct) => boolean;
  /** Sets a quantity, clamped to 0..max. 0 removes the line. Returns the quantity kept. */
  setQty: (productId: string, qty: number) => number;
  setDiscount: (discountId: string | null) => void;
  setPayment: (payment: PaymentMethod) => void;
  togglePayment: () => void;
  setCashInput: (value: string) => void;
  setGcashInput: (value: string) => void;
  clear: () => void;
  resetForBranch: (branchId: string) => void;
}

const empty = { lines: [], discountId: null, cashInput: "", gcashInput: "" };

export const useCartStore = create<CartState>()((set, get) => ({
  branchId: null,
  payment: "cash",
  ...empty,
  add: (branchId, product) => {
    const state = get();
    const lines = state.branchId === branchId ? state.lines : [];
    const existing = lines.find((line) => line.productId === product.id);
    const current = existing?.qty ?? 0;
    if (current + 1 > product.sellable) return false;
    set({
      branchId,
      lines: existing
        ? lines.map((line) =>
            line.productId === product.id
              ? { ...line, qty: line.qty + 1, max: product.sellable }
              : line,
          )
        : [
            ...lines,
            {
              productId: product.id,
              name: product.name,
              genericName: product.genericName,
              sku: product.sku,
              priceCentavos: product.priceCentavos,
              isTaxable: product.isTaxable,
              qty: 1,
              max: product.sellable,
            },
          ],
    });
    return true;
  },
  setQty: (productId, qty) => {
    const line = get().lines.find((row) => row.productId === productId);
    if (!line) return 0;
    const kept = Math.max(0, Math.min(qty, line.max));
    set((state) => ({
      lines:
        kept === 0
          ? state.lines.filter((row) => row.productId !== productId)
          : state.lines.map((row) => (row.productId === productId ? { ...row, qty: kept } : row)),
    }));
    return kept;
  },
  setDiscount: (discountId) => {
    set({ discountId });
  },
  setPayment: (payment) => {
    set({ payment });
  },
  togglePayment: () => {
    set((state) => ({ payment: state.payment === "cash" ? "gcash" : "cash" }));
  },
  setCashInput: (value) => {
    set({ cashInput: value });
  },
  setGcashInput: (value) => {
    set({ gcashInput: value });
  },
  clear: () => {
    set({ ...empty });
  },
  resetForBranch: (branchId) => {
    if (get().branchId !== branchId) set({ ...empty, branchId });
  },
}));
