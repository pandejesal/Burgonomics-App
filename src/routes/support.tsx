import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Phone,
  Mail,
  MessageCircle,
  MessageSquare,
  FileWarning,
  ChevronDown,
  Sparkles,
  Star,
  Plus,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppCard } from "@/shared/components/common/AppCard";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { AppButton } from "@/shared/components/common/AppButton";
import { TextField } from "@/shared/components/common/TextField";
import { Text } from "@/shared/components/common/Text";
import { BottomSheet } from "@/shared/components/common/BottomSheet";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { cn } from "@/lib/utils";
import { isSafeTelNumber, isSafeEmail } from "@/shared/utils/urlSafety";
import { supportRepository } from "@/features/support/repositories/SupportRepository";
import { useCustomerTickets } from "@/features/support/hooks/useCustomerTickets";
import { CreateTicketForm } from "@/features/support/components/CreateTicketForm";
import { TicketListAccordion } from "@/features/support/components/TicketListAccordion";
import { useOrdersStore } from "@/features/orders";
import type { Order } from "@/features/orders";
import type {
  FaqItem,
  IssueCategory,
  IssueCategoryId,
  SupportChannel,
} from "@/features/support/models";
import { toast } from "sonner";
import { toUserMessage } from "@/core/errors/userMessages";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Help & support — Burgonomics" },
      {
        name: "description",
        content: "Get help with your order, contact the restaurant or browse FAQs.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    topic: typeof search.topic === "string" ? search.topic : undefined,
    paymentId: typeof search.paymentId === "string" ? search.paymentId : undefined,
    // Order-context deep link (MT-08): the tracking page routes customers here
    // with the order id so the ticket can be traced without retyping it.
    orderId: typeof search.orderId === "string" ? search.orderId : undefined,
    message: typeof search.message === "string" ? search.message : undefined,
  }),
  component: Page,
});

const ICONS: Record<SupportChannel["kind"], typeof Phone> = {
  call: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  chat: MessageSquare,
  form: FileWarning,
  ai: Sparkles,
};

function Page() {
  // Deep link from the payment failure panel (paid-but-no-order): open the
  // ticket drawer prefilled with the payment id so the customer never has to
  // retype it — and support gets the one field they need to trace the money.
  const search = Route.useSearch();
  const paymentPrefill = search.topic === "payment" && search.paymentId ? search : null;
  const [faqs, setFaqs] = React.useState<FaqItem[] | null>(null);
  const [channels, setChannels] = React.useState<SupportChannel[] | null>(null);
  const [categories, setCategories] = React.useState<IssueCategory[]>([]);
  const [faqQuery, setFaqQuery] = React.useState("");
  const [openTicket, setOpenTicket] = React.useState(!!paymentPrefill);
  const [openFeedback, setOpenFeedback] = React.useState(false);

  const { tickets, createTicket, isSubmitting } = useCustomerTickets();
  // NOTE: never subscribe with selectAllOrders here — it derives a fresh
  // array per snapshot, which never stabilizes getSnapshot and loops
  // React into error #185. Subscribe to the stable `ids` ref instead.
  const orderIds = useOrdersStore((s) => s.ids);
  const pastOrders: Order[] = React.useMemo(() => {
    const st = useOrdersStore.getState();
    return orderIds.map((id) => st.byId[id]).filter(Boolean) as Order[];
  }, [orderIds]);

  React.useEffect(() => {
    void supportRepository.listFaqs().then((r) => r.success && setFaqs(r.data));
    void supportRepository.listChannels().then((r) => r.success && setChannels(r.data));
    void supportRepository.listIssueCategories().then((r) => r.success && setCategories(r.data));
  }, []);

  const filteredFaqs = React.useMemo(() => {
    if (!faqs) return null;
    const q = faqQuery.trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter(
      (f) =>
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        (f.category ?? "").toLowerCase().includes(q),
    );
  }, [faqs, faqQuery]);

  const handleTicketSubmit = async (payload: any) => {
    const res = await createTicket(payload);
    if (res.success) {
      setOpenTicket(false);
    }
  };

  return (
    <AppShell title="Help & Support" backTo="/profile" showTabs showTopBar>
      <div className="mx-auto max-w-[560px] space-y-5 px-4 py-4 select-none pb-20">
        {/* Support & SLA Guarantee Banner */}
        <div className="p-4 rounded-3xl bg-[#0E4825] border border-emerald-500/40 text-white space-y-2 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-black text-sm">
              <ShieldCheck className="w-5 h-5 text-emerald-300" />
              <span>Burgonomics Customer Care</span>
            </div>
          </div>
          <p className="text-xs text-emerald-100 leading-relaxed">
            Need help with your meal or delivery? Send a ticket below and our support team will
            get back to you — track its status right on this page. For urgent help, contact the
            store directly.
          </p>
          <button
            type="button"
            onClick={() => setOpenTicket(true)}
            className="w-full py-2.5 rounded-2xl bg-[#FF6600] hover:bg-[#e05a00] text-white font-black text-xs uppercase tracking-wider transition-all active:scale-98 flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Raise Support Ticket</span>
          </button>
        </div>

        {/* Live Support Tickets Accordion */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <Text variant="titleMedium" className="font-bold">
              Your Active & Past Tickets ({tickets.length})
            </Text>
          </div>
          <TicketListAccordion
            tickets={tickets}
            onOpenNewTicket={() => setOpenTicket(true)}
          />
        </section>

        {/* Direct Contact Channels */}
        <section className="space-y-2">
          <Text variant="titleMedium" className="font-bold">
            Direct Contact Channels
          </Text>
          {channels === null ? (
            <div className="h-24 animate-pulse rounded-2xl bg-bg-secondary" />
          ) : channels.length === 0 ? (
            <EmptyState
              title="No channels"
              description="Contact channels are currently unavailable."
            />
          ) : (
            <ul className="space-y-2">
              {channels.map((c) => (
                <li key={c.id}>
                  <ChannelRow channel={c} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Share Feedback */}
        <div className="p-4 rounded-3xl bg-surface border border-divider space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-text text-xs">Share Store Feedback</h3>
              <p className="text-[11px] text-text-secondary">Rate your food, service, or suggest a new burger flavor.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpenFeedback(true)}
              className="px-3.5 py-1.5 rounded-xl bg-surface hover:bg-bg-secondary border border-divider text-text font-bold text-xs cursor-pointer transition-colors"
            >
              Feedback
            </button>
          </div>
        </div>

        {/* FAQs */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Text variant="titleMedium" className="font-bold">
              Frequently Asked Questions
            </Text>
          </div>
          {faqs && faqs.length > 0 && (
            <label className="flex h-11 items-center gap-2 rounded-2xl border border-divider bg-surface px-4 focus-within:border-[#FF6600]">
              <input
                type="search"
                value={faqQuery}
                onChange={(e) => setFaqQuery(e.target.value)}
                placeholder="Search FAQs (e.g., refund, delivery time, coins)..."
                aria-label="Search frequently asked questions"
                className="flex-1 bg-transparent text-text outline-none text-xs placeholder:text-text-secondary"
              />
            </label>
          )}
          {filteredFaqs === null ? (
            <div className="h-40 animate-pulse rounded-2xl bg-bg-secondary" />
          ) : filteredFaqs.length === 0 ? (
            <EmptyState
              title={faqQuery ? "No matching FAQs" : "No FAQs"}
              description={
                faqQuery
                  ? "Try a different word or contact our store above."
                  : "Check back later — we're expanding our help center."
              }
            />
          ) : (
            <ul className="overflow-hidden rounded-3xl border border-divider bg-surface divide-y divide-divider">
              {filteredFaqs.map((f) => (
                <li key={f.id}>
                  <FaqAccordion item={f} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Create Support Ticket Drawer */}
      <BottomSheet
        open={openTicket}
        onOpenChange={setOpenTicket}
        title="Report an Issue"
        description="Your ticket is sent to our support team — track it under Your Tickets below. For urgent help, contact the store directly."
      >
        <CreateTicketForm
          key={paymentPrefill ? `pay-${paymentPrefill.paymentId}` : "blank"}
          orders={pastOrders}
          isSubmitting={isSubmitting}
          onSubmit={handleTicketSubmit}
          onCancel={() => setOpenTicket(false)}
          initialCategory={paymentPrefill ? "PAYMENT_ISSUE" : undefined}
          initialDescription={
            paymentPrefill
              ? `Payment ${paymentPrefill.paymentId} succeeded but my order was not created. Please confirm my payment and create the order or refund me.`
              : undefined
          }
        />
      </BottomSheet>

      {/* Share Feedback Drawer */}
      <BottomSheet
        open={openFeedback}
        onOpenChange={setOpenFeedback}
        title="Share your feedback"
        description="How was your experience with Burgonomics?"
      >
        <FeedbackForm onSubmitted={() => setOpenFeedback(false)} />
      </BottomSheet>
    </AppShell>
  );
}

function ChannelRow({ channel }: { channel: SupportChannel }) {
  const Icon = ICONS[channel.kind] ?? MessageSquare;
  // Loop 19/120: masked fixture values (e.g. "+911****3123") must never
  // become tappable tel: links. Loop 20/120: same for fixture emails.
  const callOk =
    channel.kind === "call" && !!channel.value && isSafeTelNumber(channel.value);
  const emailOk =
    channel.kind === "email" && !!channel.value && isSafeEmail(channel.value);
  const href =
    callOk
      ? `tel:${channel.value}`
      : emailOk
        ? `mailto:${channel.value}`
        : channel.kind === "whatsapp" && channel.value
          ? channel.value
          : undefined;

  const disabled = !channel.available || !href;
  const Wrapper: React.ElementType = href && !disabled ? "a" : "div";

  return (
    <Wrapper
      href={href}
      target={channel.kind === "whatsapp" ? "_blank" : undefined}
      rel={channel.kind === "whatsapp" ? "noreferrer noopener" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-divider bg-surface p-3 transition-colors text-text",
        disabled ? "opacity-70" : "hover:border-[#0E4825] hover:bg-bg-secondary",
      )}
      aria-disabled={disabled || undefined}
    >
      <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[#0E4825] text-emerald-300">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-xs truncate">
            {channel.label}
          </span>
          {!channel.available && <AppBadge tone="neutral">Soon</AppBadge>}
        </div>
        {channel.helper && (
          <span className="text-[11px] text-text-secondary block truncate">
            {channel.helper}
          </span>
        )}
      </div>
    </Wrapper>
  );
}

function FaqAccordion({ item }: { item: FaqItem }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-850/60 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold text-text block truncate">
            {item.question}
          </span>
          {item.category && (
            <span className="text-[10px] text-text-secondary uppercase font-semibold">
              {item.category}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-none text-neutral-400 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs text-text-secondary leading-relaxed">
            {item.answer}
          </p>
        </div>
      )}
    </div>
  );
}

function FeedbackForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [suggestion, setSuggestion] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (rating < 1) {
      setError("Please tap a star to rate your experience.");
      return;
    }
    setBusy(true);
    const res = await supportRepository.submitFeedback({
      rating,
      comment: comment.trim() || undefined,
      suggestion: suggestion.trim() || undefined,
    });
    setBusy(false);
    if (!res.success) {
      // P1-13: `submitFeedback` fails with raw exception text in the message.
      console.error("[support] feedback submit failed:", res.error);
      setError(toUserMessage(res));
      return;
    }
    toast.success("Thanks for the feedback!");
    setRating(0);
    setComment("");
    setSuggestion("");
    onSubmitted();
  };

  return (
    <form onSubmit={submit} className="space-y-3 text-white">
      <fieldset>
        <legend className="text-xs font-bold uppercase text-neutral-400">Your rating</legend>
        <div
          role="radiogroup"
          aria-label="Rate your experience"
          className="mt-2 flex items-center gap-1"
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = n <= rating;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => setRating(n)}
                className="grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-90"
              >
                <Star
                  className={cn(
                    "h-7 w-7 transition-colors",
                    filled ? "fill-amber-400 text-amber-400" : "text-neutral-600",
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-text-secondary">Comment</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="What did you love or dislike?"
          className="rounded-2xl border border-divider bg-bg-secondary px-4 py-3 text-xs text-text placeholder:text-text-secondary outline-none focus:border-[#FF6600]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase text-text-secondary">Suggestion (optional)</span>
        <textarea
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value.slice(0, 500))}
          rows={2}
          placeholder="Anything we should build next?"
          className="rounded-2xl border border-divider bg-bg-secondary px-4 py-3 text-xs text-text placeholder:text-text-secondary outline-none focus:border-[#FF6600]"
        />
      </label>
      {error && (
        <div role="alert">
          <Text variant="bodyMedium" tone="error">
            {error}
          </Text>
        </div>
      )}
      <AppButton type="submit" fullWidth loading={busy}>
        Send feedback
      </AppButton>
    </form>
  );
}

export default Page;
