import * as React from "react";
import { ChevronDown, Plus } from "lucide-react";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { cn } from "@/lib/utils";
import type { CustomerTicket } from "@/features/support/hooks/useCustomerTickets";

interface Props {
  tickets: CustomerTicket[];
  onOpenNewTicket: () => void;
  /**
   * Ticket id to expand on mount — the push `data.ticketId` deeplink target
   * (`/support?ticketId=<id>`). Matched by id only; never by subject.
   */
  initialOpenId?: string;
}

/**
 * TicketListAccordion — renders the customer's real tickets
 * (local + backend-synced via useCustomerTickets). Expandable rows show
 * status, escalation level, and any manager response. Empty state offers
 * the new-ticket action — never seeded demo tickets.
 */
export const TicketListAccordion = React.memo(function TicketListAccordion({
  tickets,
  onOpenNewTicket,
  initialOpenId,
}: Props) {
  const [openId, setOpenId] = React.useState<string | null>(initialOpenId ?? null);

  // Late-arriving server tickets: expand the deeplink target once it lands.
  React.useEffect(() => {
    if (initialOpenId && tickets.some((t) => t.id === initialOpenId)) {
      setOpenId(initialOpenId);
    }
  }, [initialOpenId, tickets]);

  if (tickets.length === 0) {
    return (
      <EmptyState
        title="No tickets yet"
        description="Raise a ticket and track its status here."
        actionLabel="Raise a ticket"
        onAction={onOpenNewTicket}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {tickets.map((t) => {
        const open = openId === t.id;
        return (
          <li key={t.id} className="overflow-hidden rounded-2xl border border-divider bg-surface">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : t.id)}
              className="flex w-full items-center justify-between gap-2 p-3.5 text-left cursor-pointer"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-text">
                  {t.ticketNumber} · {t.categoryLabel}
                </p>
                <p className="truncate text-[11px] text-text-secondary">{t.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <AppBadge tone={t.status === "RESOLVED" ? "success" : t.status === "ESCALATED" ? "warning" : "neutral"}>
                  {t.status.replace("_", " ")}
                </AppBadge>
                <ChevronDown className={cn("h-4 w-4 text-text-secondary transition-transform", open && "rotate-180")} aria-hidden />
              </div>
            </button>
            {open && (
              <div className="space-y-1.5 border-t border-divider px-3.5 py-3 text-[11px] text-text-secondary">
                <p>Opened {new Date(t.createdAt).toLocaleString()}</p>
                {t.orderShortCode && <p>Order: {t.orderShortCode}</p>}
                {t.priority === "urgent" && <p className="font-bold text-warning">Marked urgent</p>}
                {t.managerResponse ? (
                  <p className="rounded-xl bg-bg-secondary p-2.5 text-text">{t.managerResponse}</p>
                ) : (
                  <p>No response yet — the store team has been notified.</p>
                )}
                {t.resolvedAt && <p>Resolved {new Date(t.resolvedAt).toLocaleString()}</p>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
});

// Re-export the ticket shape for barrel consumers.
export type { CustomerTicket };
