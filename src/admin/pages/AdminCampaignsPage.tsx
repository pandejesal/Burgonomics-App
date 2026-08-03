import React, { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Megaphone,
  Plus,
  Copy,
  Trash2,
  Pause,
  Play,
  Archive,
  Search,
  ExternalLink,
  Percent,
  Download,
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { ResponsiveTable, TableColumn } from "../components/TableSystem";
import { StatusBadge } from "../components/Badges";
import { ConfirmDialog } from "../components/Utilities";
import { marketingStorage, MarketingCampaign } from "./marketingData";

export const AdminCampaignsPage: React.FC = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [activeTab, setActiveTab] = useState<
    "All" | "Active" | "Scheduled" | "Completed" | "Draft" | "Archived"
  >("All");
  const [selectedCampaign, setSelectedCampaign] = useState<MarketingCampaign | null>(null);
  const [dialogAction, setDialogAction] = useState<
    "pause" | "resume" | "archive" | "delete" | null
  >(null);

  useEffect(() => {
    setCampaigns(marketingStorage.getCampaigns());
    const sub = marketingStorage.subscribe(() => {
      setCampaigns(marketingStorage.getCampaigns());
    });
    return () => {
      sub();
    };
  }, []);

  const handleAction = (
    campaign: MarketingCampaign,
    action: "pause" | "resume" | "archive" | "delete",
  ) => {
    setSelectedCampaign(campaign);
    setDialogAction(action);
  };

  const handleConfirmAction = () => {
    if (!selectedCampaign || !dialogAction) return;

    if (dialogAction === "pause") {
      marketingStorage.updateCampaignStatus(selectedCampaign.id, "Paused");
    } else if (dialogAction === "resume") {
      marketingStorage.updateCampaignStatus(selectedCampaign.id, "Active");
    } else if (dialogAction === "archive") {
      marketingStorage.updateCampaignStatus(selectedCampaign.id, "Archived");
    } else if (dialogAction === "delete") {
      marketingStorage.deleteCampaign(selectedCampaign.id);
    }

    setSelectedCampaign(null);
    setDialogAction(null);
  };

  const handleDuplicate = (id: string) => {
    marketingStorage.duplicateCampaign(id);
  };

  // Filter campaigns by active tab
  const filteredCampaigns = campaigns.filter((c) => {
    if (activeTab === "All") return true;
    return c.status === activeTab;
  });

  const columns: TableColumn<MarketingCampaign>[] = [
    {
      header: "Campaign Details",
      accessorKey: "name",
      cell: (row) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-gray-900 dark:text-white hover:text-[#0E4825] transition-colors">
              {row.name}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest font-mono text-gray-400">
              {row.id}
            </span>
          </div>
          <p className="text-xs text-gray-400 line-clamp-1 max-w-[280px]">{row.description}</p>
          <p className="text-[10px] text-gray-400 font-medium">
            Created on {row.createdAt} by {row.createdBy}
          </p>
        </div>
      ),
    },
    {
      header: "Channels",
      accessorKey: "channels",
      cell: (row) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          {row.channels.map((chan) => (
            <span
              key={chan}
              className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                chan === "WhatsApp"
                  ? "bg-green-50 text-green-600 dark:bg-green-950/20"
                  : chan === "SMS"
                    ? "bg-orange-50 text-orange-600 dark:bg-orange-950/20"
                    : chan === "Push"
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20"
                      : "bg-blue-50 text-blue-600 dark:bg-blue-950/20"
              }`}
            >
              {chan}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: "Target Segment",
      accessorKey: "audienceType",
      cell: (row) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-2.5 py-1 text-xs font-bold text-gray-500">
          {row.audienceType}
        </span>
      ),
    },
    {
      header: "Funnel Analytics",
      accessorKey: "stats",
      cell: (row) => {
        if (row.stats.sent === 0) {
          return (
            <span className="text-xs font-semibold text-gray-400 font-mono">Not yet sent</span>
          );
        }
        const ctr = ((row.stats.clicked / row.stats.delivered) * 100).toFixed(1);
        return (
          <div className="space-y-0.5 text-xs font-mono">
            <div className="flex justify-between gap-4 text-gray-400">
              <span>Dispatched:</span>
              <span className="font-bold text-gray-800 dark:text-gray-200">{row.stats.sent}</span>
            </div>
            <div className="flex justify-between gap-4 text-gray-400">
              <span>CTR (Click):</span>
              <span className="font-bold text-[#FF6600]">{ctr}%</span>
            </div>
            <div className="flex justify-between gap-4 text-gray-400">
              <span>Delivered:</span>
              <span className="font-bold text-emerald-600">{row.stats.delivered}</span>
            </div>
          </div>
        );
      },
    },
    {
      header: "Revenue",
      accessorKey: "stats",
      cell: (row) => (
        <span className="font-mono font-bold text-sm text-[#0E4825] dark:text-emerald-400">
          {row.stats.revenue > 0 ? `₹${row.stats.revenue.toLocaleString()}` : "—"}
        </span>
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (row) => {
        let badgeStatus: "active" | "inactive" | "pending" = "inactive";
        if (row.status === "Active") badgeStatus = "active";
        else if (row.status === "Scheduled") badgeStatus = "pending";
        return <StatusBadge status={badgeStatus} label={row.status} />;
      },
    },
    {
      header: "Operations",
      accessorKey: "id",
      sortable: false,
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          {row.status === "Active" ? (
            <button
              onClick={() => handleAction(row, "pause")}
              className="p-1.5 rounded-xl border border-gray-100 dark:border-gray-800 text-gray-400 hover:text-[#FF6600] hover:bg-gray-50 dark:hover:bg-gray-900 transition-all cursor-pointer"
              title="Pause Campaign"
            >
              <Pause size={14} />
            </button>
          ) : row.status === "Paused" || row.status === "Draft" ? (
            <button
              onClick={() => handleAction(row, "resume")}
              className="p-1.5 rounded-xl border border-gray-100 dark:border-gray-800 text-[#0E4825] hover:bg-gray-50 dark:hover:bg-gray-900 transition-all cursor-pointer"
              title="Resume/Activate Campaign"
            >
              <Play size={14} />
            </button>
          ) : null}

          <button
            onClick={() => handleDuplicate(row.id)}
            className="p-1.5 rounded-xl border border-gray-100 dark:border-gray-800 text-gray-400 hover:text-[#0E4825] hover:bg-gray-50 dark:hover:bg-gray-900 transition-all cursor-pointer"
            title="Duplicate Campaign"
          >
            <Copy size={14} />
          </button>

          {row.status !== "Archived" && (
            <button
              onClick={() => handleAction(row, "archive")}
              className="p-1.5 rounded-xl border border-gray-100 dark:border-gray-800 text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 transition-all cursor-pointer"
              title="Archive Campaign"
            >
              <Archive size={14} />
            </button>
          )}

          <button
            onClick={() => handleAction(row, "delete")}
            className="p-1.5 rounded-xl border border-gray-100 dark:border-gray-800 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all cursor-pointer"
            title="Delete Campaign"
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
        title="Campaigns Repository"
        description="Review past and active marketing runs, pause checkouts, copy successful templates, and audit direct conversions."
        breadcrumbs={[{ label: "Marketing Hub", to: "/admin/marketing" }, { label: "Campaigns" }]}
        actions={
          <AdminButton
            variant="primary"
            size="sm"
            onClick={() => void navigate({ to: "/admin/campaigns/create" })}
          >
            <Plus size={14} />
            <span>Create Campaign Wizard</span>
          </AdminButton>
        }
      />

      {/* Tabs segment */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 overflow-x-auto gap-2">
        {(["All", "Active", "Scheduled", "Completed", "Draft", "Archived"] as const).map((tab) => {
          const count =
            tab === "All" ? campaigns.length : campaigns.filter((c) => c.status === tab).length;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? "border-[#0E4825] text-[#0E4825] dark:border-emerald-500 dark:text-emerald-400 font-black"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              <span>{tab}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[9px] font-black font-mono ${
                  isActive
                    ? "bg-[#0E4825]/10 text-[#0E4825] dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-gray-100 text-gray-400 dark:bg-gray-900"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Campaigns Table */}
      <div className="bg-white dark:bg-[#1A1A1A] rounded-[20px] border border-gray-100 dark:border-gray-800 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
        <ResponsiveTable
          data={filteredCampaigns}
          columns={columns}
          searchPlaceholder="Search campaign directory by campaign title, objective, channel or code..."
          searchFields={["name", "objective", "couponCode"]}
          exportFileName={`campaigns-${activeTab.toLowerCase()}`}
        />
      </div>

      {/* Confirmation Dialogs */}
      {selectedCampaign && dialogAction && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => {
            setSelectedCampaign(null);
            setDialogAction(null);
          }}
          onConfirm={handleConfirmAction}
          title={
            dialogAction === "pause"
              ? "Pause Active Campaign?"
              : dialogAction === "resume"
                ? "Resume Campaign Broadcast?"
                : dialogAction === "archive"
                  ? "Archive Completed Campaign?"
                  : "Permanently Delete Campaign?"
          }
          description={
            dialogAction === "pause"
              ? `Are you sure you want to pause "${selectedCampaign.name}"? This stops live recipient checkouts and prevents promotional notifications from reaching further queues.`
              : dialogAction === "resume"
                ? `Confirm activating/resuming "${selectedCampaign.name}". This will queue notifications and register any active coupons with our billing router.`
                : dialogAction === "archive"
                  ? `Are you sure you want to archive "${selectedCampaign.name}"? It will be filed in your history under the Archived tab, leaving its reports active but blocking further dispatches.`
                  : `WARNING: Deleting "${selectedCampaign.name}" is completely irreversible. All delivery stats, clicks, and associated localized analytics reports will be wiped from this workspace.`
          }
          confirmLabel={
            dialogAction === "pause"
              ? "Pause Broadcast"
              : dialogAction === "resume"
                ? "Activate Campaign"
                : dialogAction === "archive"
                  ? "Archive"
                  : "Confirm Delete"
          }
        />
      )}
    </div>
  );
};
