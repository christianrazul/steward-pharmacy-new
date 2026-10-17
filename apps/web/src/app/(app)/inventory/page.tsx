"use client";

import { PackageIcon } from "lucide-react";
import { Card } from "@steward/ui/components/card";
import { EmptyState } from "@steward/ui/components/empty-state";

import { Page } from "@/components/page-header";
import { RequirePermission } from "@/components/require-permission";

export default function InventoryPage() {
  return (
    <RequirePermission action="inventory.view">
      <Page title="Inventory" description="Products on the shelf at this branch.">
        <Card>
          <EmptyState icon={PackageIcon} title="No products yet">
            Stock levels, batches and expiry dates appear here.
          </EmptyState>
        </Card>
      </Page>
    </RequirePermission>
  );
}
