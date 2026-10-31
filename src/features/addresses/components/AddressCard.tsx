import { Home, Briefcase, MapPin, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Text } from "@/shared/components/common/Text";
import { AppBadge } from "@/shared/components/common/AppBadge";
import type { Address } from "@/features/addresses/models";

interface Props {
  address: Address;
  selected?: boolean;
  onClick?: () => void;
  actionSlot?: React.ReactNode;
}

const labelIcon = {
  home: Home,
  work: Briefcase,
  other: MapPin,
} as const;

export function AddressCard({ address, selected, onClick, actionSlot }: Props) {
  const Icon = labelIcon[address.label];
  const heading =
    address.label === "other" && address.customLabel
      ? address.customLabel
      : address.label.charAt(0).toUpperCase() + address.label.slice(1);
  const line = [
    address.line1,
    address.line2,
    address.landmark,
    `${address.city} ${address.pincode}`,
  ]
    .filter(Boolean)
    .join(", ");

  // Only ever render contact details the doc actually carries: a missing
  // number must not leave a stray "+91 ", and an absent name must not print
  // "undefined".
  const contact = [address.contactName, address.contactPhone ? `+91 ${address.contactPhone}` : null]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      className={cn(
        "w-full rounded-[var(--radius-large)] border bg-surface p-4 text-left transition-colors",
        selected
          ? "border-primary shadow-[var(--shadow-low)] ring-1 ring-primary/20"
          : "border-divider hover:border-primary/40",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid h-10 w-10 flex-none place-items-center rounded-full",
            selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary-text",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text variant="titleMedium" className="font-semibold">
              {heading}
            </Text>
            {address.isDefault && <AppBadge tone="success">Default</AppBadge>}
            {selected && (
              <Check
                className="ml-auto h-4 w-4 flex-none text-primary-text"
                aria-label="Selected"
              />
            )}
          </div>
          <Text variant="bodyMedium" tone="secondary" className="mt-1 leading-relaxed">
            {line}
          </Text>
          {contact && (
            <Text variant="caption" tone="secondary" className="mt-1.5 block">
              {contact}
            </Text>
          )}
          {actionSlot && <div className="mt-3">{actionSlot}</div>}
        </div>
      </div>
    </Wrapper>
  );
}
