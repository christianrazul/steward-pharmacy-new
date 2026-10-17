"use client";

import { LayoutDashboardIcon } from "lucide-react";
import { Card } from "@steward/ui/components/card";
import { EmptyState } from "@steward/ui/components/empty-state";

import { Page } from "@/components/page-header";
import { RequirePermission } from "@/components/require-permission";

export default function DashboardPage() {
  return (
    <RequirePermission action="dashboard.view">
      <Page title="Dashboard" description="Sales, stock and requests across your branches.">
        <Card>
          <EmptyState icon={LayoutDashboardIcon} title="Nothing to show yet">
            Revenue, trends and stock alerts appear here once screens are built in Milestone 2.
          </EmptyState>
        </Card>
      </Page>
    </RequirePermission>
  );
}
