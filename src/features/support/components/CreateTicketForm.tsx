import React, { useState } from "react";
import { Camera, X, Clock } from "lucide-react";
import { toast } from "sonner";
import type { TicketCategory } from "../hooks/useCustomerTickets";
import type { Order } from "@/features/orders";

interface CreateTicketFormProps {
  orders?: Order[];
  preselectedOrderId?: string;
  initialCategory?: TicketCategory;
  initialDescription?: string;
  isSubmitting?: boolean;
  onSubmit: (data: {
    orderId?: string;
    orderShortCode?: string;
    category: TicketCategory;
    description: string;
    photos: string[];
    photoFiles: File[];
  }) => Promise<void> | void;
  onCancel?: () => void;
}

const CATEGORIES: { code: TicketCategory; label: string; icon: string }[] = [
  { code: "LATE_DELIVERY", label: "Delayed Delivery", icon: "⏱️" },
  { code: "MISSING_ITEM", label: "Missing Item", icon: "📦" },
  { code: "FOOD_QUALITY", label: "Cold / Soggy Food", icon: "🍔" },
  { code: "WRONG_ORDER", label: "Wrong Item Delivered", icon: "🔄" },
  { code: "PAYMENT_ISSUE", label: "Payment / Charge Issue", icon: "💳" },
  { code: "OTHER", label: "General Feedback", icon: "💬" },
];

export function CreateTicketForm({
  orders = [],
  preselectedOrderId,
  initialCategory,
  initialDescription,
  isSubmitting = false,
  onSubmit,
  onCancel,
}: CreateTicketFormProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    preselectedOrderId || orders[0]?.id || "",
  );
  const [category, setCategory] = useState<TicketCategory>(initialCategory ?? "FOOD_QUALITY");
  const [description, setDescription] = useState(initialDescription ?? "");
  // Local files only — previews use object URLs, uploads go to Storage via
  // the ticket hook. Nothing base64 is ever produced or persisted here.
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  React.useEffect(() => {
    return () => {
      for (const url of previews) URL.revokeObjectURL(url);
    };
  }, [previews]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (photoFiles.length + files.length > 3) {
      toast.error("You can upload a maximum of 3 photos");
      return;
    }

    const accepted: File[] = [];
    const newPreviews: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`File ${file.name} exceeds 5MB limit`);
        continue;
      }
      if (!file.type.startsWith("image/")) {
        toast.error(`File ${file.name} is not an image`);
        continue;
      }
      accepted.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }
    if (accepted.length > 0) {
      setPhotoFiles((prev) => [...prev, ...accepted].slice(0, 3));
      setPreviews((prev) => [...prev, ...newPreviews].slice(0, 3));
    }
    // Reset the input so the same file can be re-picked after removal.
    e.target.value = "";
  };

  const handleRemovePhoto = (index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      toast.error("Please choose an issue category");
      return;
    }
    if (description.trim().length < 10) {
      toast.error("Please enter a description of at least 10 characters");
      return;
    }

    const matchedOrder = orders.find((o) => o.id === selectedOrderId);
    const shortCode = matchedOrder?.shortCode || selectedOrderId?.slice(-6).toUpperCase();

    onSubmit({
      orderId: selectedOrderId || undefined,
      orderShortCode: shortCode || undefined,
      category,
      description: description.trim(),
      photos: [],
      photoFiles,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-3xl border border-divider bg-surface p-5 text-text shadow-xl"
    >
      {/* Header */}
      <div className="border-b border-divider pb-3">
        <h2 className="type-title-large flex items-center gap-2 text-text">
          <span>Report an Issue / Support Ticket</span>
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          Submit details for rapid resolution with our branch manager
        </p>
      </div>

      {/* 1. Order Selector */}
      {orders.length > 0 && (
        <div className="space-y-2">
          <label className="block type-label-large text-text-secondary">Select related order</label>
          <select
            value={selectedOrderId}
            onChange={(e) => setSelectedOrderId(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-divider bg-bg-secondary px-3 py-2 text-base font-medium text-text focus:border-primary focus:outline-none"
          >
            <option value="">-- No specific order --</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                #{o.shortCode || o.id.slice(-6).toUpperCase()} • {o.store?.name || "Burgonomics"} (
                {o.status?.label || o.status?.code})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 2. Issue Category Grid */}
      <div className="space-y-2">
        <label className="block type-label-large text-text-secondary">Issue category</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.code}
              type="button"
              onClick={() => setCategory(cat.code)}
              aria-pressed={category === cat.code}
              className={`min-h-11 rounded-2xl border p-3 text-left transition-colors cursor-pointer ${
                category === cat.code
                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                  : "border-divider bg-bg-secondary text-text-secondary hover:text-text"
              }`}
            >
              <div className="mb-1 text-base" aria-hidden>
                {cat.icon}
              </div>
              <span className="block text-sm font-semibold leading-tight">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Description Field */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="type-label-large text-text-secondary">Describe the problem</label>
          <span
            className={`text-sm ${description.length >= 10 ? "text-success" : "text-text-secondary"}`}
          >
            {description.length}/10 min chars
          </span>
        </div>
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Please share specific details (e.g. burger was cold upon arrival, or missing Peri Peri dip)…"
          className="w-full rounded-2xl border border-divider bg-bg-secondary px-4 py-3 text-base leading-relaxed text-text placeholder:text-text-secondary focus:border-primary focus:outline-none"
          required
        />
      </div>

      {/* 4. Photo Upload Area */}
      <div className="space-y-2">
        <label className="block type-label-large text-text-secondary">
          Attach photos (optional, max 3)
        </label>

        <div className="flex items-center gap-2.5">
          {previews.map((src, index) => (
            <div
              key={index}
              className="group relative h-16 w-16 overflow-hidden rounded-xl border border-divider"
            >
              <img
                src={src}
                alt={`Attachment ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemovePhoto(index)}
                aria-label={`Remove attachment ${index + 1}`}
                className="absolute right-1 top-1 rounded-full bg-black/80 p-1 text-white transition-colors hover:bg-error cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}

          {photoFiles.length < 3 && (
            <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-bg-secondary text-text-secondary transition-colors hover:bg-surface hover:text-text">
              <Camera className="mb-0.5 h-5 w-5" aria-hidden />
              <span className="text-sm font-medium">Add photo</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* 5. Support-flow notice — honest generic copy (no unverifiable SLA guarantee) */}
      <div className="space-y-1.5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-text-secondary">
        <div className="flex items-center gap-1.5 font-semibold text-text">
          <Clock className="h-4 w-4 shrink-0 text-primary-text" aria-hidden />
          <span>How support works</span>
        </div>
        <p className="text-sm leading-relaxed text-text-secondary">
          Our store team is notified as soon as you submit. Track status and responses under Your
          Tickets below.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2.5 border-t border-divider pt-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-divider bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text"
          >
            Cancel
          </button>
        )}

        <button
          type="submit"
          disabled={isSubmitting || description.trim().length < 10}
          className="min-h-11 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary-hover active:scale-95 cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? "Submitting…" : "Submit support ticket"}
        </button>
      </div>
    </form>
  );
}

export default CreateTicketForm;
