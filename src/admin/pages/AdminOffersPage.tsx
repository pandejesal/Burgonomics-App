import React, { useEffect, useState } from "react";
import {
  Gift,
  Plus,
  ToggleLeft,
  ToggleRight,
  Percent,
  Calendar,
  Store,
  Trash2,
  Sparkles,
  Search,
  CheckCircle,
  Tag,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { ResponsiveTable, TableColumn } from "../components/TableSystem";
import { StatusBadge } from "../components/Badges";
import { AdminButton } from "../components/Buttons";
import { ConfirmDialog } from "../components/Utilities";
import { marketingStorage, MarketingOffer } from "./marketingData";

export const AdminOffersPage: React.FC = () => {
  const [offers, setOffers] = useState<MarketingOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<MarketingOffer | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [offerName, setOfferName] = useState("");
  const [offerDesc, setOfferDesc] = useState("");
  const [offerType, setOfferType] = useState<any>("BOGO");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");

  useEffect(() => {
    setOffers(marketingStorage.getOffers());
    const sub = marketingStorage.subscribe(() => {
      setOffers(marketingStorage.getOffers());
    });
    return () => {
      sub();
    };
  }, []);

  const toggleOfferStatus = (id: string) => {
    const offer = offers.find((o) => o.id === id);
    if (offer) {
      const nextStatus = offer.status === "Active" ? "Inactive" : "Active";
      marketingStorage.updateOfferStatus(id, nextStatus);
    }
  };

  const handleDeleteOffer = (id: string) => {
    marketingStorage.deleteOffer(id);
  };

  const handleCreateOffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerName || !validFrom || !validTo) return;

    marketingStorage.createOffer({
      name: offerName,
      description: offerDesc,
      type: offerType,
      discountValue: discountValue ? parseFloat(discountValue) : undefined,
      minOrderValue: minOrder ? parseFloat(minOrder) : undefined,
      status: "Active",
      validFrom,
      validTo,
    });

    // Reset Form
    setOfferName("");
    setOfferDesc("");
    setOfferType("BOGO");
    setDiscountValue("");
    setMinOrder("");
    setValidFrom("");
    setValidTo("");
    setShowCreateModal(false);
  };

  const activeCount = offers.filter((o) => o.status === "Active").length;

  const columns: TableColumn<MarketingOffer>[] = [
    {
      header: "Offer Name",
      accessorKey: "name",
      cell: (row) => (
        <div className="space-y-1">
          <span className="font-bold text-sm text-gray-900 dark:text-white block">{row.name}</span>
          <p className="text-xs text-gray-400 line-clamp-1 max-w-[240px]">{row.description}</p>
          <span className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-widest">
            {row.id}
          </span>
        </div>
      ),
    },
    {
      header: "Offer Type",
      accessorKey: "type",
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 dark:bg-orange-950/20 border border-orange-200/20 px-2.5 py-1 text-xs font-bold text-[#FF6600]">
          <Tag size={12} />
          {row.type}
        </span>
      ),
    },
    {
      header: "Value Constraints",
      accessorKey: "discountValue",
      cell: (row) => (
        <div className="space-y-0.5 text-xs">
          {row.discountValue && (
            <span className="font-mono font-bold block text-gray-800 dark:text-gray-200">
              {row.type === "Percentage Discount"
                ? `${row.discountValue}% OFF`
                : `₹${row.discountValue} OFF`}
            </span>
          )}
          {row.minOrderValue ? (
            <span className="font-mono text-gray-400 block">Min cart: ₹{row.minOrderValue}</span>
          ) : (
            <span className="text-gray-400 block">No bounds</span>
          )}
        </div>
      ),
    },
    {
      header: "Validity Period",
      accessorKey: "validTo",
      cell: (row) => (
        <div className="text-xs font-medium text-gray-500 font-mono space-y-0.5">
          <span>From: {row.validFrom}</span>
          <span className="block">To: {row.validTo}</span>
        </div>
      ),
    },
    {
      header: "Stores Scope",
      accessorKey: "stores",
      cell: (row) => (
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Store size={12} />
          {row.stores && row.stores.length > 0 ? `${row.stores.length} Outlets` : "National (All)"}
        </span>
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (row) => (
        <StatusBadge status={row.status === "Active" ? "active" : "inactive"} label={row.status} />
      ),
    },
    {
      header: "State Toggles",
      accessorKey: "id",
      sortable: false,
      cell: (row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleOfferStatus(row.id)}
            className="p-1.5 hover:text-[#0E4825] cursor-pointer"
            title={row.status === "Active" ? "Suspend Offer" : "Activate Offer"}
          >
            {row.status === "Active" ? (
              <ToggleRight size={28} className="text-[#0E4825]" />
            ) : (
              <ToggleLeft size={28} className="text-gray-300" />
            )}
          </button>
          <button
            onClick={() => setSelectedOffer(row)}
            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl border border-gray-100 dark:border-gray-800 transition-all cursor-pointer"
            title="Delete Offer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promotional Offers & Rewards"
        description="Configure Buy-One-Get-One deals, student and festival percentages, and free delivery boundaries across outlets."
        breadcrumbs={[{ label: "Marketing Hub", to: "/admin/marketing" }, { label: "Offers" }]}
        actions={
          <AdminButton variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} />
            <span>Create Promo Offer</span>
          </AdminButton>
        }
      />

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Configured Offers" value={offers.length} icon={Gift} />
        <StatCard
          title="Active Live Offers"
          value={`${activeCount} / ${offers.length}`}
          icon={Percent}
        />
        <AdminCard className="flex items-center justify-between">
          <div>
            <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest">
              Store Specific Limits
            </span>
            <span className="block text-2xl font-black text-[#0E4825] dark:text-emerald-400 mt-1">
              Geo-Fenced
            </span>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Geo-boundary targeting active on 1 outlet.
            </p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-[#FF6600]">
            <Store size={20} />
          </span>
        </AdminCard>
      </div>

      {/* Offers Grid & Table split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visual Offer Cards Layout */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-sm font-black text-gray-800 dark:text-gray-200 uppercase tracking-wider font-mono">
            Active Store Offers Preview
          </h3>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
            {offers
              .filter((o) => o.status === "Active")
              .map((offer) => (
                <div
                  key={offer.id}
                  className="rounded-2xl p-4 border border-[#0E4825]/15 bg-gradient-to-br from-[#0E4825]/5 to-transparent relative overflow-hidden flex flex-col justify-between h-40 shadow-sm"
                >
                  {/* Diagonal background accent badge */}
                  <div className="absolute top-0 right-0 h-16 w-16 bg-[#FF6600]/10 rounded-bl-full flex items-center justify-end p-2.5 text-[#FF6600]">
                    <Sparkles size={16} />
                  </div>

                  <div className="space-y-1">
                    <span className="inline-block px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-950/20 text-[#0E4825]">
                      {offer.type}
                    </span>
                    <h4 className="font-extrabold text-sm text-gray-900 dark:text-white line-clamp-1 max-w-[200px]">
                      {offer.name}
                    </h4>
                    <p className="text-xs text-gray-400 line-clamp-2 max-w-[220px]">
                      {offer.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider font-mono pt-2 border-t border-gray-100 dark:border-gray-800/50">
                    <span className="flex items-center gap-1">
                      <Calendar size={10} />
                      Valid till: {offer.validTo}
                    </span>
                    {offer.discountValue && (
                      <span className="text-[#FF6600] font-black">
                        Value:{" "}
                        {offer.type === "Percentage Discount"
                          ? `${offer.discountValue}%`
                          : `₹${offer.discountValue}`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Structured Offers Table */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-[#1A1A1A] rounded-[20px] border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
            <ResponsiveTable
              data={offers}
              columns={columns}
              searchPlaceholder="Search offer ledger by name, type or outlet..."
              searchFields={["name", "type"]}
              exportFileName="offers-ledger"
            />
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {selectedOffer && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setSelectedOffer(null)}
          onConfirm={() => {
            handleDeleteOffer(selectedOffer.id);
            setSelectedOffer(null);
          }}
          title="Delete Promotional Offer?"
          description={`WARNING: Deleting offer "${selectedOffer.name}" is a permanent action. This offer will be stripped from all active checkouts and billing APIs instantly.`}
          confirmLabel="Delete Offer"
        />
      )}

      {/* Create Offer Sliding Overlay / Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]">
          <AdminCard
            title="Configure New Promotional Offer"
            subtitle="Setup Buy-One-Get-One, Combo pricing, or cart discount boundaries"
            className="w-full max-w-lg shadow-2xl animate-scaleIn border border-gray-100"
          >
            <form onSubmit={handleCreateOffer} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase block">
                  Offer Name
                </label>
                <input
                  type="text"
                  required
                  value={offerName}
                  onChange={(e) => setOfferName(e.target.value)}
                  placeholder="e.g. Free Pepsi On Midweek Combos"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-2 text-sm focus:outline-none dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase block">
                  Description / Terms
                </label>
                <textarea
                  value={offerDesc}
                  onChange={(e) => setOfferDesc(e.target.value)}
                  placeholder="Offer details visible to customers at checkout..."
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-2 text-sm focus:outline-none dark:text-white h-20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase block">
                    Offer Type
                  </label>
                  <select
                    value={offerType}
                    onChange={(e) => setOfferType(e.target.value as any)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-3 py-2 text-sm focus:outline-none dark:text-white"
                  >
                    <option value="BOGO">BOGO (Buy 1 Get 1)</option>
                    <option value="Combo Offer">Combo Offer</option>
                    <option value="Flat Discount">Flat Discount</option>
                    <option value="Percentage Discount">Percentage Discount</option>
                    <option value="Free Delivery">Free Delivery</option>
                    <option value="Limited Time">Limited Time Deal</option>
                    <option value="Festival Offer">Festival Offer</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase block">
                    Value (Percentage or INR)
                  </label>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="e.g. 50 or 150"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-2 text-sm focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase block">
                    Valid From
                  </label>
                  <input
                    type="date"
                    required
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-3 py-2 text-sm focus:outline-none dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase block">
                    Valid Until
                  </label>
                  <input
                    type="date"
                    required
                    value={validTo}
                    onChange={(e) => setValidTo(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-3 py-2 text-sm focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase block">
                  Min Cart Value Boundary (Optional)
                </label>
                <input
                  type="number"
                  value={minOrder}
                  onChange={(e) => setMinOrder(e.target.value)}
                  placeholder="e.g. 299"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-2 text-sm focus:outline-none dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
                <AdminButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </AdminButton>
                <AdminButton type="submit" variant="primary" size="sm">
                  Launch Offer
                </AdminButton>
              </div>
            </form>
          </AdminCard>
        </div>
      )}
    </div>
  );
};
