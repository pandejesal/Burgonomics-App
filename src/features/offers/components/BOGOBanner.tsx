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
        "relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#0E4825] via-[#122e1a] to-[#0A0A0A] border border-[#0E4825]/40 text-white p-5 shadow-lg select-none",
        className
      )}
    >
      <div className="flex flex-col gap-3">
        {/* Top Badges */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[10px] font-black uppercase tracking-wider text-[#4ADE80]">
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>Signature BOGO</span>
          </span>

          <span className="px-2.5 py-0.5 rounded-full bg-[#FF6600] text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
            1+1 FREE
          </span>
        </div>

        {/* Title and Explanation */}
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
            BUY 1 GET 1 FREE
          </h2>
          <p className="text-xs sm:text-sm text-zinc-300 mt-1">
            Order any 2 Smashed Burgers & the lower-priced burger is 100% Free.
          </p>
        </div>

        {/* Bottom Action Row */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/20 text-xs font-mono font-bold transition-all cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5 text-[#4ADE80]" />
            <span>{code}</span>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[#4ADE80]" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
            )}
          </button>

          {onApplyCode && (
            <button
              type="button"
              onClick={() => onApplyCode(code)}
              className="px-4 py-1.5 rounded-xl bg-[#FF6600] hover:bg-[#e05a00] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              Apply to Cart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BOGOBanner;
