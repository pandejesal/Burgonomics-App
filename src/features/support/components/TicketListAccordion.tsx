import React, { useState } from "react";
import {
  Ticket,
  ChevronDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import type { CustomerTicket, TicketStatus } from "../hooks/useCustomerTickets";

interface TicketListAccordionProps {
  tickets: CustomerTicket[];
  onOpenNewTicket?: () => void;
}

const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; bg: string; text: string; border: string; icon: typeof CheckCircle2 }
> = {
  OPEN: {
    label: "Under Review",
    bg: "bg-blue-950/70",
    text: "text-blue-300",
    border: "border-blue-500/40",
    icon: Clock,
  },
  IN_PROGRESS: {
    label: "Store Investigating",
    bg: "bg-amber-950/70",
    text: "text-amber-300",
    border: "border-amber-500/40",
    icon: Clock,
  },
  RESOLVED: {
    label: "Resolved",
    bg: "bg-emerald-950/70",
    text: "text-emerald-300",
    border: "border-emerald-500/40",
    icon: CheckCircle2,
  },
  ESCALATED: {
    label: "Escalated to Area Lead",
    bg: "bg-[#FF6600]/20",
    text: "text-[#FF6600]",
    border: "border-[#FF6600]/40",
    icon: Flame,
  },
};

export function TicketListAccordion({ tickets, onOpenNewTicket }: TicketListAccordionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(tickets[0]?.id || null);

  if (tickets.length === 0) {
    return (
      <div className="p-8 rounded-3xl bg-neutral-900/40 border border-dashed border-neutral-800 text-center space-y-2">
        <Ticket className="w-8 h-8 mx-auto text-neutral-600" />
        <p className="font-bold text-white text-xs">No Active Support Tickets</p>
        <p className="text-[11px] text-neutral-400">
          Everything looking good with your meals! If you face any issues, our manager is here to help.
        </p>
        {onOpenNewTicket && (
          <button
            type="button"
            onClick={onOpenNewTicket}
            className="mt-2 px-4 py-2 rounded-xl bg-[#0E4825] hover:bg-[#135d30] border border-emerald-500/40 text-emerald-300 font-bold text-xs"
          >
            Raise a Ticket
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((tkt) => {
        const isExpanded = expandedId === tkt.id;
        const statusMeta = STATUS_CONFIG[tkt.status] || STATUS_CONFIG.OPEN;
        const StatusIcon = statusMeta.icon;

        return (
          <div
            key={tkt.id}
            className="rounded-2xl bg-[#0D0D0D] border border-neutral-800 overflow-hidden transition-all text-xs"
          >
            {/* Accordion Row Header */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : tkt.id)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-neutral-900/60 transition-colors cursor-pointer"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-white text-xs">
                    #{tkt.ticketNumber}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}
                  >
                    <StatusIcon className="w-2.5 h-2.5" />
                    <span>{statusMeta.label}</span>
                  </span>
                </div>
                <p className="font-bold text-white text-xs">{tkt.categoryLabel}</p>
                {tkt.orderShortCode && (
                  <p className="text-[11px] text-neutral-400 font-mono">
                    Order #{tkt.orderShortCode}
                  </p>
                )}
              </div>

              <ChevronDown
                className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="p-4 pt-0 border-t border-neutral-800/60 space-y-3">
                {/* Description */}
                <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-850 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block">
                    Your Reported Issue
                  </span>
                  <p className="text-neutral-200 text-xs leading-relaxed">{tkt.description}</p>
                </div>

                {/* Photos if any */}
                {tkt.photos && tkt.photos.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-neutral-400 block">
                      Attached Photos ({tkt.photos.length})
                    </span>
                    <div className="flex items-center gap-2">
                      {tkt.photos.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt="Ticket attachment"
                          className="w-14 h-14 object-cover rounded-xl border border-neutral-700"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Manager Response */}
                {tkt.managerResponse ? (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-1 text-emerald-300">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Store Manager Resolution</span>
                    </div>
                    <p className="text-xs text-neutral-200 leading-relaxed">
                      {tkt.managerResponse}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-850 flex items-center gap-2 text-neutral-400">
                    <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-[11px]">
                      Ticket active in store queue. Expected response within 15 minutes.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default TicketListAccordion;
