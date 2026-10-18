import type { RequestPriority, RequestStatus } from "@steward/domain";
import { FlameIcon } from "lucide-react";
import { Badge, type BadgeVariant } from "@steward/ui/components/badge";

const PRIORITY: Record<RequestPriority, [string, BadgeVariant]> = {
  urgent: ["Urgent", "danger"],
  normal: ["Normal", "secondary"],
  low: ["Low", "outline"],
};

const STATUS: Record<RequestStatus, [string, BadgeVariant]> = {
  pending: ["Pending", "warning"],
  approved: ["Approved", "info"],
  fulfilled: ["Fulfilled", "success"],
  declined: ["Declined", "secondary"],
};

export function PriorityBadge({ priority }: { priority: RequestPriority }) {
  const [label, variant] = PRIORITY[priority];
  return (
    <Badge variant={variant}>
      {priority === "urgent" && <FlameIcon aria-hidden="true" />}
      {label}
    </Badge>
  );
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const [label, variant] = STATUS[status];
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
}
