import { AppBadge } from "@/shared/components/common/AppBadge";
import type { OrderStatusMeta } from "@/features/orders/models";

interface Props {
  status: OrderStatusMeta;
  className?: string;
}

/**
 * OrderStatusBadge — repository-driven. The badge's tone is picked from
 * the semantic `kind`, not from the code string, so unknown future
 * codes still render cleanly.
 */
export function OrderStatusBadge({ status, className }: Props) {
  const tone =
    status.kind === "completed"
      ? "success"
      : status.kind === "cancelled" || status.kind === "failed"
        ? "error"
        : status.kind === "in_progress"
          ? "primary"
          : status.kind === "upcoming"
            ? "warning"
            : "neutral";
  return (
    <AppBadge tone={tone} className={className}>
      {status.label}
    </AppBadge>
  );
}
