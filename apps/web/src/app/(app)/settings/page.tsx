"use client";

import { SettingsIcon } from "lucide-react";
import { Card } from "@steward/ui/components/card";
import { EmptyState } from "@steward/ui/components/empty-state";

import { Page } from "@/components/page-header";
import { RequirePermission } from "@/components/require-permission";

export default function SettingsPage() {
  return (
    <RequirePermission action="settings.manage">
      <Page
        title="Settings"
        description="Branches, staff accounts, discounts and how receipts are computed."
      >
        <Card>
          <EmptyState icon={SettingsIcon} title="Nothing to configure yet">
            General settings, branches, staff accounts and discounts arrive in Milestone 2.
          </EmptyState>
        </Card>
      </Page>
    </RequirePermission>
  );
}
