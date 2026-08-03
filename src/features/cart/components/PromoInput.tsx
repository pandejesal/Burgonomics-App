import * as React from "react";
import { Tag, X, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { formatINR } from "@/core/utils/format";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import type { AppliedPromo } from "@/features/cart/models";

interface Props {
  applied: AppliedPromo | null;
  onChanged: () => void;
  /** Show a "Browse offers" link. Defaults to true. */
  showBrowseLink?: boolean;
}

/**
 * PromoInput — coupon entry field. All validation and discount
 * calculation happens inside `cartRepository.applyPromo`, which
 * delegates to `OfferRepository`. No local coupon logic.
 */
export function PromoInput({ applied, onChanged, showBrowseLink = true }: Props) {
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await cartRepository.applyPromo(code);
    setBusy(false);
    if (!res.success) {
      setError(res.error.message);
      return;
    }
    setCode("");
    onChanged();
  };

  const remove = async () => {
    await cartRepository.removePromo();
    onChanged();
  };

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-[var(--radius-medium)] border border-success/40 bg-success/5 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <Tag className="h-4 w-4 shrink-0 text-success" aria-hidden />
          <div className="min-w-0">
            <Text variant="titleMedium" className="truncate">
              {applied.description ?? applied.code}
            </Text>
            <Text variant="caption" tone="secondary" className="truncate">
              {applied.code} · {applied.savingsLabel ?? `−${formatINR(applied.discount)}`}
            </Text>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void remove()}
          aria-label="Remove offer"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-bg-secondary"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <form onSubmit={apply} className="space-y-1">
        <label className="flex items-center gap-2 rounded-[var(--radius-medium)] border border-divider bg-surface px-3">
          <Tag className="h-4 w-4 text-text-secondary" aria-hidden />
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (error) setError(null);
            }}
            placeholder="Enter coupon code"
            aria-label="Coupon code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="min-h-[44px] flex-1 bg-transparent outline-none type-body-large placeholder:text-text-disabled"
          />
          <AppButton type="submit" variant="ghost" size="sm" disabled={!code.trim()} loading={busy}>
            Apply
          </AppButton>
        </label>
        {error && (
          <Text variant="caption" tone="error" role="alert">
            {error}
          </Text>
        )}
      </form>
      {showBrowseLink && (
        <Link
          to="/offers"
          className="inline-flex items-center gap-1.5 type-label-large text-primary hover:underline"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Browse available offers
        </Link>
      )}
    </div>
  );
}
