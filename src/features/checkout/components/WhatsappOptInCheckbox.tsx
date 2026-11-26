import * as React from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";

interface WhatsappOptInCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

/**
 * "Send me order updates on WhatsApp" consent box (owner decision
 * 2026-11-25 #3).
 *
 * OFF by default: the box starts unticked on every checkout, and consent is
 * only recorded (with a timestamp, in the checkout store) when the customer
 * ticks it. Unticking revokes it immediately. Nothing is pre-ticked, and the
 * preference is never inherited from a previous order.
 */
export function WhatsappOptInCheckbox({
  checked,
  onChange,
  className,
}: WhatsappOptInCheckboxProps) {
  const id = React.useId();
  return (
    <div
      className={cn(
        "rounded-[var(--radius-large)] border border-divider bg-surface p-4 sm:p-5",
        className,
      )}
    >
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 select-none">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            void HapticService.selection();
            onChange(event.target.checked);
          }}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-border text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 type-body font-semibold text-text-primary">
            <MessageCircle className="h-4 w-4 shrink-0 text-primary-text" aria-hidden />
            Send me order updates on WhatsApp
          </span>
          <span className="mt-1 block type-caption leading-relaxed text-text-secondary">
            Optional. We&apos;ll message this order&apos;s status to the phone number on your
            account. Untick any time.
          </span>
        </span>
      </label>
    </div>
  );
}

export default WhatsappOptInCheckbox;
