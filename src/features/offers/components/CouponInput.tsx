import * as React from "react";
import { Tag, X } from "lucide-react";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";

interface Props {
  onSubmit: (code: string) => Promise<void>;
  busy?: boolean;
  error?: string | null;
  success?: string | null;
  onClearMessage?: () => void;
}

/**
 * CouponInput — thin input wrapper. Validation is delegated entirely
 * to the caller (which routes through OfferRepository). No local
 * validation is ever performed.
 */
export function CouponInput({ onSubmit, busy = false, error, success, onClearMessage }: Props) {
  const [code, setCode] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    await onSubmit(code.trim().toUpperCase());
  };

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <label className="flex items-center gap-2 rounded-[var(--radius-medium)] border border-divider bg-surface px-3">
        <Tag className="h-4 w-4 text-text-secondary" aria-hidden />
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            onClearMessage?.();
          }}
          placeholder="Enter coupon code"
          aria-label="Coupon code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-[44px] flex-1 bg-transparent font-mono tracking-wider outline-none type-body-large placeholder:text-text-disabled placeholder:font-sans placeholder:tracking-normal"
        />
        {code && !busy && (
          <button
            type="button"
            aria-label="Clear coupon code"
            onClick={() => {
              setCode("");
              onClearMessage?.();
            }}
            className="grid h-9 w-9 place-items-center rounded-full text-text-secondary hover:bg-bg-secondary"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        <AppButton type="submit" variant="ghost" size="sm" disabled={!code.trim()} loading={busy}>
          Apply
        </AppButton>
      </label>
      {error && (
        <Text variant="caption" tone="error" role="alert">
          {error}
        </Text>
      )}
      {success && !error && (
        <Text variant="caption" className="text-success" role="status">
          {success}
        </Text>
      )}
    </form>
  );
}
