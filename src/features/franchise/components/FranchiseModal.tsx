import * as React from "react";
import { X, Building2, CheckCircle2, Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";

interface FranchiseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FranchiseModal({ isOpen, onClose }: FranchiseModalProps) {
  const [formData, setFormData] = React.useState({
    name: "",
    phone: "",
    email: "",
    city: "Ahmedabad",
    budget: "₹25L - ₹40L",
    notes: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      toast.error("Please fill in your name and phone number");
      return;
    }

    // Loop 47/120: franchise enquiries persist to the live franchise_leads
    // collection (rules bind customerId == uid). The old code waited 800ms
    // and toasted success while the PII went nowhere. Guests must sign in
    // first — the collection is auth-bound by design.
    setBusy(true);
    void HapticService.impact("medium");
    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) {
        toast.error("Please sign in to submit a franchise enquiry.");
        setBusy(false);
        return;
      }
      await addDoc(collection(db, "franchise_leads"), {
        customerId: user.uid,
        customerName: formData.name.trim(),
        customerPhone: formData.phone.trim(),
        customerEmail: formData.email.trim() || null,
        city: formData.city,
        budget: formData.budget,
        notes: formData.notes.trim() || null,
        status: "new",
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      setBusy(false);
      toast.error("Enquiry NOT sent — please try again.", {
        description: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    setBusy(false);
    setSubmitted(true);
    toast.success("Franchise enquiry submitted successfully!");
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-surface border border-border p-6 shadow-high max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-text-primary">
                  Franchise Opportunity
                </h3>
                <p className="text-xs text-text-secondary">
                  Join Gujarat's fastest growing Pure Veg QSR
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-secondary text-text-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {submitted ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-4">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h4 className="font-display text-xl font-bold text-text-primary">
                Application Received!
              </h4>
              <p className="mt-2 text-xs text-text-secondary max-w-xs mx-auto leading-relaxed">
                Thank you for your interest in partnering with Burgonomics. Our franchise expansion team will contact you within 24 hours.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  onClose();
                }}
                className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-xs font-bold text-white shadow-sm hover:bg-primary-hover transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Patel"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-border bg-bg-secondary px-3.5 py-2.5 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-xl border border-border bg-bg-secondary px-3.5 py-2.5 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="name@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-xl border border-border bg-bg-secondary px-3.5 py-2.5 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Target City
                  </label>
                  <select
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full rounded-xl border border-border bg-bg-secondary px-3.5 py-2.5 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                  >
                    <option value="Ahmedabad">Ahmedabad</option>
                    <option value="Surat">Surat</option>
                    <option value="Vadodara">Vadodara</option>
                    <option value="Rajkot">Rajkot</option>
                    <option value="Gandhinagar">Gandhinagar</option>
                    <option value="Bhavnagar">Bhavnagar</option>
                    <option value="Other">Other Location</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Investment Budget
                  </label>
                  <select
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                    className="w-full rounded-xl border border-border bg-bg-secondary px-3.5 py-2.5 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                  >
                    <option value="₹20L - ₹30L">₹20L - ₹30L</option>
                    <option value="₹30L - ₹50L">₹30L - ₹50L</option>
                    <option value="₹50L+">₹50L+ (Multi-Unit)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Additional Notes / Commercial Property Details
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Own 600 sq.ft commercial space on main SG Highway road"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-xl border border-border bg-bg-secondary px-3.5 py-2.5 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-white shadow-md hover:bg-primary-hover active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  <span>{busy ? "Submitting Application..." : "Submit Franchise Application"}</span>
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
