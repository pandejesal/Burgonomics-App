import * as React from "react";
import { Sparkles, Flame, Tag, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";

interface BOGOBannerProps {
  code?: string;
  onApplyCode?: (code: string) => void;
  className?: string;
}

export function BOGOBanner({
  code = "BURGERBOGO",
  onApplyCode,
  className,
}: BOGOBannerProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void HapticService.impact("light");
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(`Coupon code ${code} copied!`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "relative select-none overflow-hidden rounded-2xl border border-primary bg-primary p-5 text-primary-foreground shadow-lg",
        className
      )}
    >
      <div className="flex flex-col gap-4">
        {/* Top Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-sm font-semibold text-primary-foreground backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            <span>Signature BOGO</span>
          </span>

          <span className="rounded-full bg-accent px-2.5 py-1 text-sm font-semibold text-accent-foreground shadow-sm">
            1+1 FREE
          </span>
        </div>

        {/* Title and Explanation */}
        <div>
          <h2 className="type-headline-large leading-tight text-primary-foreground">
            Buy 1 Get 1 Free
          </h2>
          <p className="mt-1 text-base leading-relaxed text-primary-foreground/85">
            Order any 2 Smashed Burgers &amp; the lower-priced burger is 100% Free.
          </p>
        </div>

        {/* Bottom Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/25 bg-black/30 px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-black/45 cursor-pointer"
          >
            <Tag className="h-3.5 w-3.5" aria-hidden />
            <span>{code}</span>
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5 text-primary-foreground/70" aria-hidden />
            )}
          </button>

          {onApplyCode && (
            <button
              type="button"
              onClick={() => onApplyCode(code)}
              className="min-h-11 rounded-xl bg-primary-foreground px-4 py-2 text-sm font-semibold text-primary-text shadow-xs transition-colors hover:bg-primary-foreground/90 cursor-pointer"
            >
              Apply to cart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BOGOBanner;
