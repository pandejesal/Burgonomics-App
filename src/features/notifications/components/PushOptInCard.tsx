import * as React from "react";
import { BellRing } from "lucide-react";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { logger } from "@/core/logging/logger";
import {
  recordPushPromptDecision,
  type PushPromptDecision,
} from "@/features/notifications/pushPrompt";

interface PushOptInCardProps {
  /** Prompts the OS, then registers. Resolves true when permission is granted. */
  onRequestPermission: () => Promise<boolean>;
  /** Called once the customer answered, so the parent can hide the card. */
  onAnswered: (decision: PushPromptDecision) => void;
}

/**
 * One-time "Get live order updates" card for the order-confirmation screen.
 *
 * Deliberately a card, not a surprise OS dialog: the OS prompt appears only
 * after an explicit "Turn on" tap. It reuses the existing design system
 * (AppButton sizes are 44px+ by construction, Text tokens, the same
 * surface/divider card treatment as the receipt sections around it) — no new
 * visual style, no single-purpose component library.
 *
 * The customer's answer is persisted before the parent hides the card, so a
 * "Not now" never nags on a later order.
 */
export function PushOptInCard({ onRequestPermission, onAnswered }: PushOptInCardProps) {
  const [busy, setBusy] = React.useState(false);
  // Guards a double-tap from prompting/recording twice.
  const answeredRef = React.useRef(false);

  const answer = React.useCallback(
    (decision: PushPromptDecision) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      recordPushPromptDecision(decision);
      onAnswered(decision);
    },
    [onAnswered],
  );

  const handleTurnOn = React.useCallback(async () => {
    if (answeredRef.current || busy) return;
    setBusy(true);
    let granted = false;
    try {
      granted = await onRequestPermission();
    } catch (err) {
      // Silent to the customer (the confirmation screen must never show a
      // permission failure), but logged for support.
      logger.warn("push.orderConfirmationPromptFailed", {
        message: err instanceof Error ? err.message : String(err),
      });
      granted = false;
    } finally {
      setBusy(false);
    }
    // Recording "dismissed" on a refused prompt is honest: the OS state is now
    // `denied` or still undecided, and Settings is the route either way.
    answer(granted ? "granted" : "dismissed");
  }, [answer, busy, onRequestPermission]);

  return (
    <section
      aria-label="Get live order updates"
      className="rounded-2xl border border-divider bg-surface p-4 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BellRing className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <Text variant="titleMedium" className="font-semibold text-text">
            Get live order updates
          </Text>
          <Text variant="bodySmall" tone="secondary" className="mt-1 leading-relaxed">
            We&apos;ll tell you the moment your order is confirmed, cooking and on its way.
          </Text>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <AppButton
          variant="cta"
          size="sm"
          fullWidth
          loading={busy}
          onClick={() => void handleTurnOn()}
        >
          Turn on
        </AppButton>
        <AppButton
          variant="ghost"
          size="sm"
          fullWidth
          disabled={busy}
          onClick={() => answer("dismissed")}
        >
          Not now
        </AppButton>
      </div>
    </section>
  );
}
