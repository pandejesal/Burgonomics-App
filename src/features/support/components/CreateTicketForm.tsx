import React, { useState } from "react";
import {
  AlertCircle,
  Camera,
  X,
  UploadCloud,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import type { TicketCategory } from "../hooks/useCustomerTickets";
import type { Order } from "@/features/orders";

interface CreateTicketFormProps {
  orders?: Order[];
  preselectedOrderId?: string;
  initialCategory?: TicketCategory;
  initialDescription?: string;
  isSubmitting?: boolean;
  /**
   * Backend-provided response SLA in minutes. The SLA notice renders only
   * when this is present — never invent response-time promises.
   */
  slaMinutes?: number | null;
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
  slaMinutes = null,
  onSubmit,
  onCancel,
}: CreateTicketFormProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string>(preselectedOrderId || (orders[0]?.id || ""));
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
    <form onSubmit={handleSubmit} className="p-5 rounded-3xl bg-[#0D0D0D] border border-neutral-800 space-y-4 text-white shadow-xl">
      {/* Header */}
      <div className="border-b border-neutral-800 pb-3">
        <h2 className="text-base font-black text-white flex items-center gap-2">
          <span>Report an Issue / Support Ticket</span>
        </h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Submit details for rapid resolution with our branch manager
        </p>
      </div>

      {/* 1. Order Selector */}
      {orders.length > 0 && (
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase text-neutral-400">
            Select Related Order
          </label>
          <select
            value={selectedOrderId}
            onChange={(e) => setSelectedOrderId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs font-semibold focus:outline-none focus:border-[#FF6600]"
          >
            <option value="">-- No specific order --</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                #{o.shortCode || o.id.slice(-6).toUpperCase()} • {o.store?.name || "Burgonomics"} ({o.status?.label || o.status?.code})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 2. Issue Category Grid */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold uppercase text-neutral-400">
          Issue Category
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.code}
              type="button"
              onClick={() => setCategory(cat.code)}
              className={`p-2.5 rounded-2xl border text-left transition-colors cursor-pointer ${
                category === cat.code
                  ? "bg-[#0E4825] border-emerald-500 text-white shadow-xs"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white"
              }`}
            >
              <div className="text-base mb-1">{cat.icon}</div>
              <span className="font-bold text-xs block leading-tight">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Description Field */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label className="font-bold uppercase text-neutral-400">
            Describe the Problem
          </label>
          <span className={`text-[11px] ${description.length >= 10 ? "text-emerald-400" : "text-neutral-500"}`}>
            {description.length}/10 min chars
          </span>
        </div>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Please share specific details (e.g. burger was cold upon arrival, or missing Peri Peri dip)..."
          className="w-full px-3 py-2 rounded-2xl bg-neutral-900 border border-neutral-700 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-[#FF6600]"
          required
        />
      </div>

      {/* 4. Photo Upload Area */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase text-neutral-400">
          Attach Photos (Optional, max 3)
        </label>

        <div className="flex items-center gap-2">
          {previews.map((src, index) => (
            <div key={index} className="relative w-16 h-16 rounded-xl overflow-hidden border border-neutral-700 group">
              <img src={src} alt={`Attachment ${index + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemovePhoto(index)}
                className="absolute top-1 right-1 p-0.5 rounded-full bg-black/80 text-white hover:bg-red-600 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {photoFiles.length < 3 && (
            <label className="w-16 h-16 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/60 hover:bg-neutral-850 flex flex-col items-center justify-center cursor-pointer text-neutral-400 hover:text-white transition-colors">
              <Camera className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] font-bold">Add Photo</span>
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

      {/* 5. Escalation notice — SLA copy only when backend-provided */}
      <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-1 text-xs text-emerald-300">
        <div className="flex items-center gap-1.5 font-bold">
          <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {typeof slaMinutes === "number" && Number.isFinite(slaMinutes)
              ? `Transparent ${slaMinutes}-Min SLA Guarantee`
              : "How support works"}
          </span>
        </div>
        <p className="text-[11px] text-neutral-300 leading-relaxed">
          {typeof slaMinutes === "number" && Number.isFinite(slaMinutes) ? (
            <>
              Our store manager responds in &lt;{slaMinutes} mins. If unaddressed, your ticket
              automatically escalates to the Regional Operations Lead.
            </>
          ) : (
            "Our store team is notified as soon as you submit. Track status and responses under Your Tickets below."
          )}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-neutral-900 text-neutral-300 hover:text-white font-bold text-xs"
          >
            Cancel
          </button>
        )}

        <button
          type="submit"
          disabled={isSubmitting || description.trim().length < 10}
          className="px-5 py-2.5 rounded-xl bg-[#FF6600] hover:bg-[#e05a00] text-white font-black text-xs uppercase tracking-wider shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : "Submit Support Ticket"}
        </button>
      </div>
    </form>
  );
}

export default CreateTicketForm;
