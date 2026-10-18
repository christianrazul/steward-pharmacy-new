"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2Icon, PercentIcon, SlidersHorizontalIcon, UsersIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@steward/ui/components/tabs";

import { Page } from "@/components/page-header";
import { RequirePermission } from "@/components/require-permission";
import { BranchSettings } from "@/components/settings/branch-settings";
import { DiscountSettings } from "@/components/settings/discount-settings";
import { GeneralSettings } from "@/components/settings/general-settings";
import { StaffSettings } from "@/components/settings/staff-settings";

const TABS = [
  { value: "general", label: "General", icon: SlidersHorizontalIcon },
  { value: "branches", label: "Branches", icon: Building2Icon },
  { value: "accounts", label: "Staff accounts", icon: UsersIcon },
  { value: "discounts", label: "Discounts", icon: PercentIcon },
] as const;

export default function SettingsPage() {
  return (
    <RequirePermission action="settings.manage">
      <Suspense>
        <Settings />
      </Suspense>
    </RequirePermission>
  );
}

function Settings() {
  const params = useSearchParams();
  const requested = params.get("tab");
  const [tab, setTab] = useState<string>(
    TABS.some((t) => t.value === requested) ? (requested ?? "general") : "general",
  );

  return (
    <div className="max-w-[1040px]">
      <Page
        title="Settings"
        description="Branches, staff accounts, discounts and how receipts are computed."
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="underline" aria-label="Settings sections">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value}>
                <Icon aria-hidden="true" className="!size-[15px]" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="general">
            <GeneralSettings />
          </TabsContent>
          <TabsContent value="branches">
            <BranchSettings />
          </TabsContent>
          <TabsContent value="accounts">
            <StaffSettings />
          </TabsContent>
          <TabsContent value="discounts">
            <DiscountSettings />
          </TabsContent>
        </Tabs>
      </Page>
    </div>
  );
}
