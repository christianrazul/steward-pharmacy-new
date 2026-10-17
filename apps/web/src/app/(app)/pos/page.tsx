"use client";

import { ShoppingCartIcon } from "lucide-react";
import { EmptyState } from "@steward/ui/components/empty-state";

import { RequirePermission } from "@/components/require-permission";

// The POS fills the panel edge to edge (no page title), like the mockup.
export default function PointOfSalePage() {
  return (
    <RequirePermission action="pos.sell">
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={ShoppingCartIcon} title="Point of sale">
          Product search, the cart and checkout arrive in Milestone 2.
        </EmptyState>
      </div>
    </RequirePermission>
  );
}
