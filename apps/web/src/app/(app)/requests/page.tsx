"use client";

import { ArrowLeftRightIcon } from "lucide-react";
import { Card } from "@steward/ui/components/card";
import { EmptyState } from "@steward/ui/components/empty-state";

import { Page } from "@/components/page-header";
import { RequirePermission } from "@/components/require-permission";

export default function StockRequestsPage() {
  return (
    <RequirePermission action="stock_requests.view">
      <Page
        title="Stock requests"
        description="Ask central for stock when this branch is running low."
      >
        <Card>
          <EmptyState icon={ArrowLeftRightIcon} title="No requests yet">
            Requests to and from central appear here.
          </EmptyState>
        </Card>
      </Page>
    </RequirePermission>
  );
}
