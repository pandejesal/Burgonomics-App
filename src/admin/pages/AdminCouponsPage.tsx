import React, { useState } from "react";
import { Gift, Plus, ToggleLeft, ToggleRight, Percent, Sparkles } from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard } from "../components/Cards";
import { ResponsiveTable, TableColumn } from "../components/TableSystem";
import { StatusBadge } from "../components/Badges";
import { AdminButton } from "../components/Buttons";
import { ConfirmDialog } from "../components/Utilities";

interface Coupon {
  id: string;
  code: string;
  discountType: "Percentage" | "Flat INR";
  discountValue: number;
  minOrderValue: number;
  status: "Active" | "Inactive";
  expiryDate: string;
}

const INITIAL_COUPONS: Coupon[] = [
  {
    id: "CPN-101",
    code: "DAMNGOOD50",
    discountType: "Percentage",
    discountValue: 50,
    minOrderValue: 299,
    status: "Active",
    expiryDate: "2026-12-31",
  },
  {
    id: "CPN-102",
    code: "BURGERLOVE",
    discountType: "Flat INR",
    discountValue: 100,
    minOrderValue: 499,
    status: "Active",
    expiryDate: "2026-10-31",
  },
  {
    id: "CPN-103",
    code: "FREEPERIPERI",
    discountType: "Percentage",
    discountValue: 100,
    minOrderValue: 350,
    status: "Inactive",
    expiryDate: "2026-06-30",
  },
];

export const AdminCouponsPage: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>(INITIAL_COUPONS);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);

  const toggleCouponStatus = (id: string) => {
    setCoupons((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const nextStatus = c.status === "Active" ? "Inactive" : "Active";
          return { ...c, status: nextStatus };
        }
        return c;
      }),
    );
  };

  const activeCount = coupons.filter((c) => c.status === "Active").length;

  const columns: TableColumn<Coupon>[] = [
    {
      header: "Promo Code",
      accessorKey: "code",
      cell: (row) => (
        <code className="text-sm font-black font-mono bg-orange-50 dark:bg-orange-950/20 px-2 py-1 rounded-lg border border-orange-200/50 text-[#FF6600]">
          {row.code}
        </code>
      ),
    },
    {
      header: "Type",
      accessorKey: "discountType",
    },
    {
      header: "Value",
      accessorKey: "discountValue",
      cell: (row) => (
        <span className="font-mono font-bold">
          {row.discountType === "Percentage"
            ? `${row.discountValue}% OFF`
            : `₹${row.discountValue} OFF`}
        </span>
      ),
    },
    {
      header: "Min cart required",
      accessorKey: "minOrderValue",
      cell: (row) => <span className="font-mono text-gray-500">₹{row.minOrderValue}</span>,
    },
    {
      header: "Valid Untill",
      accessorKey: "expiryDate",
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
      accessorKey: "operations",
      sortable: false,
      cell: (row) => (
        <button
          onClick={() => setSelectedCoupon(row)}
          className="p-1.5 hover:text-[#FF6600]"
          title={row.status === "Active" ? "Deactivate Coupon" : "Activate Coupon"}
        >
          {row.status === "Active" ? (
            <ToggleRight size={28} className="text-[#0E4825]" />
          ) : (
            <ToggleLeft size={28} className="text-gray-300" />
          )}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promo Coupons & Offers"
        description="Release new discount vouchers, configure minimum transaction bounds, track usage rates, or toggle coupon statuses."
        breadcrumbs={[{ label: "Coupons" }]}
        actions={
          <AdminButton variant="secondary" size="sm">
            <Plus size={14} />
            <span>Create Promo Coupon</span>
          </AdminButton>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard title="Total Promo Codes" value={coupons.length} icon={Gift} />
        <StatCard
          title="Active Coupons"
          value={`${activeCount} / ${coupons.length}`}
          icon={Percent}
        />
      </div>

      <ResponsiveTable
        data={coupons}
        columns={columns}
        searchPlaceholder="Search promo directory by discount code..."
        searchFields={["code", "discountType"]}
        exportFileName="promos-manifest"
      />

      {selectedCoupon && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setSelectedCoupon(null)}
          onConfirm={() => {
            toggleCouponStatus(selectedCoupon.id);
            setSelectedCoupon(null);
          }}
          title={`${selectedCoupon.status === "Active" ? "Suspend" : "Activate"} Promo Coupon?`}
          description={`Confirm toggling validation state for promo coupon ${selectedCoupon.code}. If deactivated, customer checkout verification will block usage.`}
          confirmLabel="Toggle Coupon"
        />
      )}
    </div>
  );
};
