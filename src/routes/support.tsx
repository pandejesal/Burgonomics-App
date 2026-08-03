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
import { supportRepository } from "@/features/support/repositories/SupportRepository";
import type {
  FaqItem,
  IssueCategory,
  IssueCategoryId,
  SupportChannel,
} from "@/features/support/models";
import { toast } from "sonner";

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
  const [faqs, setFaqs] = React.useState<FaqItem[] | null>(null);
  const [channels, setChannels] = React.useState<SupportChannel[] | null>(null);
  const [categories, setCategories] = React.useState<IssueCategory[]>([]);
  const [faqQuery, setFaqQuery] = React.useState("");
  const [openTicket, setOpenTicket] = React.useState(false);
  const [openFeedback, setOpenFeedback] = React.useState(false);

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

  return (
    <AppShell title="Help & support" backTo="/profile" showTabs showTopBar>
      <div className="mx-auto max-w-[520px] space-y-4 px-4 py-4">
        {/* Contact channels */}
        <section>
          <Text variant="titleMedium" className="mb-2">
            Contact us
          </Text>
          {channels === null ? (
            <div className="h-24 animate-pulse rounded-[var(--radius-large)] bg-bg-secondary" />
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

        {/* Report + Feedback */}
        <div className="grid gap-3 sm:grid-cols-2">
          <AppCard padded>
            <Text variant="titleMedium">Report an issue</Text>
            <Text variant="bodyMedium" tone="secondary" className="mt-1">
              Tell us what went wrong with an order or the app.
            </Text>
            <AppButton
              className="mt-3"
              variant="outlined"
              onClick={() => setOpenTicket(true)}
              iconLeft={<FileWarning className="h-4 w-4" aria-hidden />}
            >
              Report an issue
            </AppButton>
          </AppCard>

          <AppCard padded>
            <Text variant="titleMedium">Share feedback</Text>
            <Text variant="bodyMedium" tone="secondary" className="mt-1">
              Rate the app and send us suggestions.
            </Text>
            <AppButton
              className="mt-3"
              variant="outlined"
              onClick={() => setOpenFeedback(true)}
              iconLeft={<Star className="h-4 w-4" aria-hidden />}
            >
              Send feedback
            </AppButton>
          </AppCard>
        </div>

        {/* FAQs */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <Text variant="titleMedium">Frequently asked questions</Text>
          </div>
          {faqs && faqs.length > 0 && (
            <label className="mb-2 flex h-11 items-center gap-2 rounded-full border border-divider bg-surface px-4 focus-within:border-primary">
              <input
                type="search"
                value={faqQuery}
                onChange={(e) => setFaqQuery(e.target.value)}
                placeholder="Search FAQs"
                aria-label="Search frequently asked questions"
                className="flex-1 bg-transparent outline-none type-body-large placeholder:text-text-disabled"
              />
            </label>
          )}
          {filteredFaqs === null ? (
            <div className="h-40 animate-pulse rounded-[var(--radius-large)] bg-bg-secondary" />
          ) : filteredFaqs.length === 0 ? (
            <EmptyState
              title={faqQuery ? "No matching FAQs" : "No FAQs"}
              description={
                faqQuery
                  ? "Try a different word or contact us above."
                  : "Check back later — we're growing our help centre."
              }
            />
          ) : (
            <ul className="overflow-hidden rounded-[var(--radius-large)] border border-divider bg-surface">
              {filteredFaqs.map((f, i) => (
                <li key={f.id} className={cn(i !== 0 && "border-t border-divider")}>
                  <FaqAccordion item={f} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <BottomSheet
        open={openTicket}
        onOpenChange={setOpenTicket}
        title="Report an issue"
        description="Our team will get back to you as soon as possible."
      >
        <ReportIssueForm categories={categories} onSubmitted={() => setOpenTicket(false)} />
      </BottomSheet>

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
  const href =
    channel.kind === "call" && channel.value
      ? `tel:${channel.value}`
      : channel.kind === "email" && channel.value
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
        "flex items-center gap-3 rounded-[var(--radius-large)] border border-divider bg-surface p-3 transition-colors",
        disabled ? "opacity-70" : "hover:border-primary/40 hover:bg-primary/5",
      )}
      aria-disabled={disabled || undefined}
    >
      <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Text variant="titleMedium" className="truncate">
            {channel.label}
          </Text>
          {!channel.available && <AppBadge tone="neutral">Soon</AppBadge>}
        </div>
        {channel.helper && (
          <Text variant="caption" tone="secondary" className="truncate">
            {channel.helper}
          </Text>
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
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <Text variant="bodyLarge" className="truncate">
            {item.question}
          </Text>
          {item.category && (
            <Text variant="caption" tone="secondary">
              {item.category}
            </Text>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-none text-text-secondary transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <Text variant="bodyMedium" tone="secondary">
            {item.answer}
          </Text>
        </div>
      )}
    </div>
  );
}

function ReportIssueForm({
  categories,
  onSubmitted,
}: {
  categories: IssueCategory[];
  onSubmitted: () => void;
}) {
  const [category, setCategory] = React.useState<IssueCategoryId | "">("");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!category) {
      setError("Please choose a category.");
      return;
    }
    setBusy(true);
    const res = await supportRepository.submitTicket({
      subject: subject.trim(),
      message: message.trim(),
      category,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error.message);
      return;
    }
    toast.success("Thanks — we've received your report.");
    setSubject("");
    setMessage("");
    setCategory("");
    onSubmitted();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <fieldset>
        <legend className="type-caption text-text-secondary uppercase">Category</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {categories.map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                aria-pressed={active}
                className={cn(
                  "rounded-full px-3 py-1.5 type-label-large transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-divider bg-surface text-text-secondary hover:text-primary",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <TextField
        label="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value.slice(0, 80))}
        placeholder="E.g. Order arrived cold"
        required
      />
      <label className="flex flex-col gap-1">
        <span className="type-caption text-text-secondary uppercase">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 800))}
          rows={5}
          required
          placeholder="Share as much detail as you can — order id, time, and what went wrong."
          className="rounded-[var(--radius-medium)] border-[1.5px] border-divider bg-surface px-4 py-3 type-body-large placeholder:text-text-disabled outline-none focus:border-primary"
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
        Submit report
      </AppButton>
    </form>
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
      setError(res.error.message);
      return;
    }
    toast.success("Thanks for the feedback!");
    setRating(0);
    setComment("");
    setSuggestion("");
    onSubmitted();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <fieldset>
        <legend className="type-caption text-text-secondary uppercase">Your rating</legend>
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
                    filled ? "fill-primary text-primary" : "text-text-disabled",
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="type-caption text-text-secondary uppercase">Comment</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="What did you love or dislike?"
          className="rounded-[var(--radius-medium)] border-[1.5px] border-divider bg-surface px-4 py-3 type-body-large placeholder:text-text-disabled outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="type-caption text-text-secondary uppercase">Suggestion (optional)</span>
        <textarea
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value.slice(0, 500))}
          rows={2}
          placeholder="Anything we should build next?"
          className="rounded-[var(--radius-medium)] border-[1.5px] border-divider bg-surface px-4 py-3 type-body-large placeholder:text-text-disabled outline-none focus:border-primary"
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
