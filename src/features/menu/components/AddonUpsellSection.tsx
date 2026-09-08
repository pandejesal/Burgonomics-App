import * as React from "react";
import { Plus } from "lucide-react";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { formatINR } from "@/core/utils/format";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { HapticService } from "@/core/services/haptics";
import { toast } from "sonner";
import type { Product } from "@/features/menu/models";

interface Props {
  products: Product[];
  title?: string;
}

/**
 * AddonUpsellSection — honest "complete your meal" rail backed by
 * server-priced related products. Adds at the repository price —
 * no client-invented combo deltas.
 */
export const AddonUpsellSection = React.memo(function AddonUpsellSection({
  products,
  title = "Complete your meal",
}: Props) {
  const store = useStoreSelection((s) => s.activeStore);

  if (products.length === 0) return null;

  const add = async (p: Product) => {
    if (!store) {
      toast.error("Please select a store first");
      return;
    }
    void HapticService.impact("medium");
    const res = await cartRepository.addItem({
      storeId: store.id,
      productId: p.id,
      name: p.name,
      unitPrice: p.price,
      quantity: 1,
      veg: p.veg ?? true,
      imageUrl: p.imageUrl,
      fallbackImageUrl: p.fallbackImageUrl,
    });
    if (!res.success) toast.error(res.error.message);
    else toast.success(`Added ${p.name}`);
  };

  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">{title}</h3>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {products.map((p) => (
          <div
            key={p.id}
            className="flex w-36 shrink-0 flex-col rounded-2xl border border-divider bg-surface p-2"
          >
            <SafeImage src={p.imageUrl} alt={p.name} className="h-20 w-full rounded-xl object-cover" />
            <p className="mt-1.5 truncate text-xs font-bold text-text">{p.name}</p>
            <p className="font-mono text-xs font-bold text-text">{formatINR(p.price)}</p>
            <button
              type="button"
              disabled={p.inStock === false}
              onClick={() => void add(p)}
              className="mt-1.5 flex min-h-[36px] items-center justify-center gap-1 rounded-xl bg-[#FF6600] text-[11px] font-extrabold uppercase text-white disabled:opacity-40 cursor-pointer"
              aria-label={`Add ${p.name} to cart`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add
            </button>
          </div>
        ))}
      </div>
    </section>
  );
});
