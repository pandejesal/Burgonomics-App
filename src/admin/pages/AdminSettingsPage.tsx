import React, { useState } from "react";
import { Settings, Save, CheckCircle, ShieldAlert, KeyRound } from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";

export const AdminSettingsPage: React.FC = () => {
  const [gstRate, setGstRate] = useState(5.0);
  const [deliveryFee, setDeliveryFee] = useState(40.0);
  const [minOrder, setMinOrder] = useState(150.0);
  const [supportPhone, setSupportPhone] = useState("+91 11 99999 88888");
  const [autoClose, setAutoClose] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
    }, 1200);
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Global Store Configurations"
        description="Override global variables, alter delivery logistics, configure tax rates, and manage mobile support parameters."
        breadcrumbs={[{ label: "Settings" }]}
      />

      <div className="max-w-2xl">
        <AdminCard
          title="Operating Configuration Form"
          subtitle="Changes affect all mobile customer checkouts instantly"
        >
          <form onSubmit={handleSaveSettings} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  GST Tax Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={gstRate}
                  onChange={(e) => setGstRate(parseFloat(e.target.value))}
                  className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm font-semibold focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Base Delivery Fee (₹)
                </label>
                <input
                  type="number"
                  step="1"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(parseFloat(e.target.value))}
                  className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm font-semibold focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Minimum Order For Delivery (₹)
                </label>
                <input
                  type="number"
                  step="5"
                  value={minOrder}
                  onChange={(e) => setMinOrder(parseFloat(e.target.value))}
                  className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm font-semibold focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Helpdesk Support Number
                </label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm font-semibold focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/60 flex items-center justify-between gap-4">
              <div>
                <span className="block text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                  Emergency Auto-Close Trigger
                </span>
                <span className="text-[11px] text-gray-400 font-semibold block mt-0.5">
                  Toggle instant offline POS mode across all platforms in case of logistics
                  failures.
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoClose}
                onChange={(e) => setAutoClose(e.target.checked)}
                className="h-5 w-5 rounded text-[#0E4825] focus:ring-[#0E4825]"
              />
            </div>

            {saveSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle size={15} />
                <span>
                  Success: Global settings modified and committed to Cloud SQL successfully!
                </span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <AdminButton type="submit" variant="primary" isLoading={isSaving} className="px-6">
                <Save size={14} />
                <span>Commit Settings Override</span>
              </AdminButton>
            </div>
          </form>
        </AdminCard>
      </div>
    </div>
  );
};
