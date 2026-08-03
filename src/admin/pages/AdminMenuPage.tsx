import React, { useState } from "react";
import { ToggleLeft, ToggleRight, Sparkles, Plus, Image } from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard } from "../components/Cards";
import { ResponsiveTable, TableColumn } from "../components/TableSystem";
import { StatusBadge } from "../components/Badges";
import { AdminButton } from "../components/Buttons";
import { ConfirmDialog } from "../components/Utilities";

interface MenuItem {
  id: string;
  name: string;
  category: "Burgers" | "Wraps" | "Sides" | "Shakes";
  price: number;
  inStock: boolean;
  petpoojaId: string;
}

const INITIAL_MENU: MenuItem[] = [
  {
    id: "MN-101",
    name: "Classic Veg Cheese Burger",
    category: "Burgers",
    price: 180.0,
    inStock: true,
    petpoojaId: "pp_cl_v_ch",
  },
  {
    id: "MN-102",
    name: "Spicy Paneer Wrap",
    category: "Wraps",
    price: 210.0,
    inStock: true,
    petpoojaId: "pp_sp_pan_wr",
  },
  {
    id: "MN-103",
    name: "Double Veg Supreme Burger",
    category: "Burgers",
    price: 250.0,
    inStock: false,
    petpoojaId: "pp_db_v_su",
  },
  {
    id: "MN-104",
    name: "Peri Peri Fries",
    category: "Sides",
    price: 130.0,
    inStock: true,
    petpoojaId: "pp_per_fries",
  },
  {
    id: "MN-105",
    name: "Crunchy Chocolate Shake",
    category: "Shakes",
    price: 170.0,
    inStock: true,
    petpoojaId: "pp_cr_choc",
  },
];

export const AdminMenuPage: React.FC = () => {
  const [menu, setMenu] = useState<MenuItem[]>(INITIAL_MENU);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const toggleStock = (id: string) => {
    setMenu((prev) =>
      prev.map((item) => (item.id === id ? { ...item, inStock: !item.inStock } : item)),
    );
  };

  const activeCount = menu.filter((item) => item.inStock).length;

  const columns: TableColumn<MenuItem>[] = [
    {
      header: "Item ID",
      accessorKey: "id",
      cell: (row) => <span className="font-mono font-bold text-gray-500">{row.id}</span>,
    },
    {
      header: "Burger/Product Name",
      accessorKey: "name",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-400">
            <Image size={16} />
          </div>
          <span className="text-gray-900 dark:text-white font-bold">{row.name}</span>
        </div>
      ),
    },
    {
      header: "Category",
      accessorKey: "category",
    },
    {
      header: "Base Price",
      accessorKey: "price",
      cell: (row) => <span className="font-mono font-bold">₹{row.price.toFixed(2)}</span>,
    },
    {
      header: "Petpooja Reference ID",
      accessorKey: "petpoojaId",
      cell: (row) => (
        <code className="text-xs font-mono bg-gray-50 dark:bg-gray-900 px-1.5 py-0.5 rounded-md border border-gray-100 dark:border-gray-800 text-[#FF6600] font-bold">
          {row.petpoojaId}
        </code>
      ),
    },
    {
      header: "In Stock Status",
      accessorKey: "inStock",
      cell: (row) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
            row.inStock
              ? "bg-emerald-50 text-[#16A34A] border-emerald-200/50"
              : "bg-red-50 text-[#DC2626] border-red-200/50"
          }`}
        >
          <span>{row.inStock ? "IN STOCK" : "OUT OF STOCK"}</span>
        </span>
      ),
    },
    {
      header: "Actions",
      accessorKey: "operations",
      sortable: false,
      cell: (row) => (
        <button
          onClick={() => setSelectedItem(row)}
          className="p-1.5 hover:text-[#FF6600]"
          title={row.inStock ? "Mark Out of Stock" : "Mark In Stock"}
        >
          {row.inStock ? (
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
        title="Catalog & Menu Editor"
        description="Oversee the digital menu of burgers, wraps, sides and shakes. Override price variables, upload hero photos, or toggle active stock."
        breadcrumbs={[{ label: "Catalog" }]}
        actions={
          <AdminButton variant="secondary" size="sm">
            <Plus size={14} />
            <span>Add Menu Item</span>
          </AdminButton>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard title="Total Menu Items" value={menu.length} icon={Sparkles} />
        <StatCard
          title="Active Stock"
          value={`${activeCount} / ${menu.length}`}
          icon={ToggleRight}
          subtext="Available for mobile orders"
        />
      </div>

      <ResponsiveTable
        data={menu}
        columns={columns}
        searchPlaceholder="Search catalog by product name, category..."
        searchFields={["name", "category"]}
        exportFileName="catalog-manifest"
      />

      {selectedItem && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setSelectedItem(null)}
          onConfirm={() => {
            toggleStock(selectedItem.id);
            setSelectedItem(null);
          }}
          title={`Override ${selectedItem.name} Stock?`}
          description={`Warning: Changing stock of this burger will sync to all active mobile clients instantly. Customers in active checkouts won't be able to purchase this item until toggled back.`}
          confirmLabel="Toggle Availability"
        />
      )}
    </div>
  );
};
