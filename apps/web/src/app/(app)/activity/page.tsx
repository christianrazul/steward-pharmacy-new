"use client";

import { ReceiptIcon } from "lucide-react";
import { Card } from "@steward/ui/components/card";
import { EmptyState } from "@steward/ui/components/empty-state";

import { Page } from "@/components/page-header";
import { RequirePermission } from "@/components/require-permission";

export default function SalesActivityPage() {
  return (
    <RequirePermission action="sales_activity.view">
      <Page title="Sales activity" description="Every receipt issued across your branches.">
        <Card>
          <EmptyState icon={ReceiptIcon} title="No receipts yet">
            Completed sales appear here with filters and totals.
          </EmptyState>
        </Card>
      </Page>
    </RequirePermission>
  );
}
