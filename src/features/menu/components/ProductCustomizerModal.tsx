import * as React from "react";
import { X, ShoppingBag } from "lucide-react";
import { BottomSheet } from "@/shared/components/common/BottomSheet";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { Skeleton } from "@/shared/components/feedback/Skeleton";
import { CustomizationPicker, type Selections } from "./CustomizationPicker";
import { QuantityStepper } from "./QuantityStepper";
import { formatINR } from "@/core/utils/format";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { HapticService } from "@/core/services/haptics";
import { toast } from "sonner";
import type { CartModifier } from "@/features/cart/models";
import type { CustomizationGroup, Product } from "@/features/menu/models";

interface Props {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ProductCustomizerModal — quick customize-and-add sheet for menu/search.
 * Base price + option deltas come from the server product doc; the
 * server reprices authoritatively at checkout. Quantity clamped 1..99.
 */
export const ProductCustomizerModal = React.memo(function ProductCustomizerModal({
  product,
  isOpen,
  onClose,
}: Props) {
  const store = useStoreSelection((s) => s.activeStore);
  const [groups, setGroups] = React.useState<CustomizationGroup[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selections, setSelections] = React.useState<Selections>({});
  const [qty, setQty] = React.useState(1);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setQty(1);
    setSelections({});
    let cancelled = false;
    setLoading(true);
    void menuRepository.getProduct(product.id, store?.id).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.success && res.data?.customizations) {
        setGroups(res.data.customizations);
        const initial: Selections = {};
        for (const g of res.data.customizations) {
          if (g.selection === "single" && g.required && g.options.length > 0) {
            const first = g.options.find((o) => !o.outOfStock) ?? g.options[0];
            initial[g.id] = [first.id];
          }
        }
        setSelections(initial);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, product.id, store?.id]);

  const unitPrice = React.useMemo(() => {
    let price = product.price;
    for (const g of groups) {
      for (const optId of selections[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) price += opt.priceDelta || 0;
      }
    }
    return Math.max(0, price);
  }, [product.price, groups, selections]);

  const requiredOk = groups.every((g) => {
    if (!g.required) return true;
    return (selections[g.id] ?? []).length > 0;
  });

  const add = async () => {
    if (!store) {
      toast.error("Please select a store first");
      return;
    }
    if (!requiredOk) {
      toast.error("Please select all required options");
      return;
    }
    setBusy(true);
    const modifiers: CartModifier[] = [];
    for (const g of groups) {
      for (const optId of selections[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) {
          modifiers.push({
            groupId: g.id,
            groupName: g.name,
            optionId: opt.id,
            name: opt.name,
            priceDelta: opt.priceDelta || 0,
          });
        }
      }
    }
    const res = await cartRepository.addItem({
      storeId: store.id,
      productId: product.id,
      name: product.name,
      unitPrice,
      quantity: Math.min(99, Math.max(1, qty)),
      veg: product.veg ?? true,
      imageUrl: product.imageUrl,
      fallbackImageUrl: product.fallbackImageUrl,
      modifiers: modifiers.length ? modifiers : undefined,
    });
    setBusy(false);
    if (!res.success) {
      toast.error(res.error.message);
      return;
    }
    void HapticService.notification("success");
    toast.success(`Added ${qty}x ${product.name}`);
    onClose();
  };

  return (
    <BottomSheet open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }} title={product.name} description={formatINR(product.price)}>
      <div className="space-y-4">
        <SafeImage src={product.imageUrl} fallbackSrc={product.fallbackImageUrl} alt={product.name} className="h-44 w-full rounded-2xl object-cover" />
        {loading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : (
          <CustomizationPicker groups={groups} value={selections} onChange={setSelections} />
        )}
        <div className="flex items-center justify-between gap-3">
          <QuantityStepper value={qty} onChange={(v) => setQty(Math.min(99, Math.max(1, v)))} />
          <button
            type="button"
            disabled={busy || !requiredOk || product.inStock === false}
            onClick={() => void add()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF6600] px-5 py-3.5 text-xs font-extrabold uppercase tracking-wide text-white disabled:opacity-50 cursor-pointer"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden />
            {busy ? "Adding…" : `Add · ${formatINR(unitPrice * qty)}`}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close customizer"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-bg-secondary text-text-secondary cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </BottomSheet>
  );
});
