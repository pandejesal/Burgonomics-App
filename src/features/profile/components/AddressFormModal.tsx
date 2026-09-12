import * as React from "react";
import { X, Home, Briefcase, MapPin, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";
import { addressRepository } from "@/features/addresses/repositories/AddressRepository";
import type { Address, AddressLabel } from "@/features/addresses/models";

interface AddressFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  addressToEdit?: Address | null;
  onSuccess?: () => void;
}

/**
 * AddressFormModal — Modal bottom-sheet for creating and editing delivery addresses.
 * Handles address tag selection (Home, Work, Other), line 1/2, landmark, city,
 * 6-digit PIN code, and the default address toggle.
 */
export function AddressFormModal({
  isOpen,
  onClose,
  addressToEdit,
  onSuccess,
}: AddressFormModalProps) {
  const [label, setLabel] = React.useState<AddressLabel>("home");
  const [customLabel, setCustomLabel] = React.useState("");
  const [line1, setLine1] = React.useState("");
  const [line2, setLine2] = React.useState("");
  const [landmark, setLandmark] = React.useState("");
  const [city, setCity] = React.useState("Mumbai");
  const [pincode, setPincode] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (addressToEdit) {
      setLabel(addressToEdit.label);
      setCustomLabel(addressToEdit.customLabel || "");
      setLine1(addressToEdit.line1);
      setLine2(addressToEdit.line2 || "");
      setLandmark(addressToEdit.landmark || "");
      setCity(addressToEdit.city);
      setPincode(addressToEdit.pincode);
      setIsDefault(addressToEdit.isDefault);
    } else {
      setLabel("home");
      setCustomLabel("");
      setLine1("");
      setLine2("");
      setLandmark("");
      setCity("Mumbai");
      setPincode("");
      setIsDefault(false);
    }
  }, [addressToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line1.trim()) {
      toast.error("Please enter flat / house / building details");
      return;
    }
    if (!pincode.trim() || pincode.length !== 6) {
      toast.error("Please enter a valid 6-digit pincode");
      return;
    }

    setSubmitting(true);
    void HapticService.impact("medium");

    const payload = {
      label,
      customLabel: label === "other" ? customLabel : undefined,
      line1: line1.trim(),
      line2: line2.trim() || undefined,
      landmark: landmark.trim() || undefined,
      city: city.trim(),
      pincode: pincode.trim(),
      isDefault,
    };

    if (addressToEdit) {
      const res = await addressRepository.update(addressToEdit.id, payload);
      setSubmitting(false);
      if (res.success) {
        toast.success("Address updated successfully");
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.error.message);
      }
    } else {
      const res = await addressRepository.create(payload);
      setSubmitting(false);
      if (res.success) {
        toast.success("Address saved successfully");
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.error.message);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-[500px] max-h-[90vh] bg-surface rounded-t-3xl sm:rounded-3xl border border-divider shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-divider flex items-center justify-between bg-surface sticky top-0 z-10">
          <h3 className="text-base sm:text-lg font-black text-text">
            {addressToEdit ? "Edit Address" : "Add Delivery Address"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-bg-secondary hover:bg-divider flex items-center justify-center text-text-secondary hover:text-text transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)] no-scrollbar">
          {/* Label Type Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Save As
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  void HapticService.selection();
                  setLabel("home");
                }}
                className={cn(
                  "py-2.5 px-3 min-h-[44px] rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer",
                  label === "home"
                    ? "border-[#0E4825] bg-[#0E4825] text-white shadow-xs"
                    : "border-divider bg-bg-secondary text-text hover:border-primary/40"
                )}
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void HapticService.selection();
                  setLabel("work");
                }}
                className={cn(
                  "py-2.5 px-3 min-h-[44px] rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer",
                  label === "work"
                    ? "border-[#0E4825] bg-[#0E4825] text-white shadow-xs"
                    : "border-divider bg-bg-secondary text-text hover:border-primary/40"
                )}
              >
                <Briefcase className="w-4 h-4" />
                <span>Work</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void HapticService.selection();
                  setLabel("other");
                }}
                className={cn(
                  "py-2.5 px-3 min-h-[44px] rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer",
                  label === "other"
                    ? "border-[#0E4825] bg-[#0E4825] text-white shadow-xs"
                    : "border-divider bg-bg-secondary text-text hover:border-primary/40"
                )}
              >
                <MapPin className="w-4 h-4" />
                <span>Other</span>
              </button>
            </div>
          </div>

          {/* Custom Label if Other */}
          {label === "other" && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-secondary">
                Nickname / Tag
              </label>
              <input
                type="text"
                placeholder="e.g. Friends House, Gym"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-medium text-text outline-none focus:border-primary"
              />
            </div>
          )}

          {/* Flat / Building */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-secondary">
              Flat / House / Building *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Flat 402, Sunshine Heights"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-medium text-text outline-none focus:border-primary"
            />
          </div>

          {/* Area / Street */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-secondary">
              Area / Street
            </label>
            <input
              type="text"
              placeholder="e.g. Linking Road, Bandra West"
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-medium text-text outline-none focus:border-primary"
            />
          </div>

          {/* Landmark & Pincode Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-secondary">
                Landmark
              </label>
              <input
                type="text"
                placeholder="e.g. Near Metro Station"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-medium text-text outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-text-secondary">
                Pincode *
              </label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="e.g. 400050"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-mono font-bold text-text outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* City */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-secondary">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-medium text-text outline-none focus:border-primary"
            />
          </div>

          {/* Default Toggle */}
          <label className="flex items-center gap-3 pt-2 min-h-[44px] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 accent-[#0E4825] rounded-sm cursor-pointer"
            />
            <span className="text-xs font-bold text-text">
              Set as default delivery address
            </span>
          </label>

          {/* Action Button */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#FF6600] hover:bg-[#e05a00] text-white text-xs sm:text-sm font-bold shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Saving..." : addressToEdit ? "Update Address" : "Save Address"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddressFormModal;
