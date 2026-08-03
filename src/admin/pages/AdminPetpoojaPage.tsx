import React, { useState } from "react";
import {
  Sliders,
  RefreshCw,
  Send,
  CheckCircle,
  Database,
  Server,
  Play,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { HealthBadge } from "../components/Badges";
import { AdminButton } from "../components/Buttons";
import { ConfirmDialog, Timeline, ActivityItem } from "../components/Utilities";

export const AdminPetpoojaPage: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const triggerSync = () => {
    setIsSyncing(true);
    setSyncDone(false);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncDone(true);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Petpooja POS Integrations"
        description="Verify POS terminal links, pull down menu changes, sync pricing matrix, and monitor transmission queues."
        breadcrumbs={[{ label: "Petpooja" }]}
        actions={
          <AdminButton
            variant="primary"
            size="sm"
            isLoading={isSyncing}
            onClick={() => setShowConfirm(true)}
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
            <span>Force Menu Sync</span>
          </AdminButton>
        }
      />

      {/* Grid of integrations health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-[20px] bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 p-6 shadow-sm space-y-4">
          <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
            Integrations Core
          </span>
          <div className="flex flex-col gap-2">
            <HealthBadge system="petpooja" status="healthy" />
            <HealthBadge system="api" status="healthy" />
            <HealthBadge system="database" status="healthy" />
          </div>
        </div>

        <StatCard
          title="Last Menu Pull"
          value="2 hours ago"
          icon={CheckCircle}
          subtext="182 catalog nodes matched"
        />

        <StatCard
          title="POS Terminals Online"
          value="5 / 5 Active"
          icon={Sliders}
          subtext="All stores transmitting orders"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sync logs timeline */}
        <AdminCard
          title="Integration Event Log"
          subtitle="Real-time POS terminal events and queue webhooks"
        >
          <Timeline>
            <ActivityItem
              title="Webhook dispatch succeeded"
              description="Order BUR-8201 transmitted to Connaught Place POS terminal. Response status: 200 OK."
              time="2 mins ago"
              variant="success"
              icon={Send}
            />
            <ActivityItem
              title="Menu structure pulling completed"
              description="Parsed 14 categories and 182 menu nodes. Automatically resolved 1 item collision."
              time="2 hours ago"
              variant="success"
              icon={Database}
            />
            <ActivityItem
              title="Petpooja OAuth Token refreshed"
              description="Validated production credentials against Petpooja servers."
              time="12 hours ago"
              variant="success"
              icon={ShieldCheck}
            />
            <ActivityItem
              title="Connection degraded at Sector 62, Noida"
              description="POS terminal ping delay exceeded 4500ms. Retrying connection."
              time="1 day ago"
              variant="warning"
              icon={Server}
            />
          </Timeline>
        </AdminCard>

        {/* Integration Credentials overview */}
        <AdminCard
          title="Active Credentials"
          subtitle="Access tokens for Petpooja sandbox & production APIs"
        >
          <div className="space-y-4 font-sans text-xs">
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/60 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                  App Key (Production)
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#0E4825]/5 text-[#0E4825] font-black font-mono">
                  LINKED
                </span>
              </div>
              <code className="block p-2 bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-100 dark:border-gray-800 font-mono text-[10px] text-gray-500 truncate select-all">
                pp_auth_prod_3b29ef58a2d109f6e3c048ea11cb02ef
              </code>
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/60 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                  Webhook Endpoint URL
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#FF6600]/5 text-[#FF6600] font-black font-mono">
                  ACTIVE
                </span>
              </div>
              <code className="block p-2 bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-100 dark:border-gray-800 font-mono text-[10px] text-gray-500 truncate select-all">
                https://api.burgonomics.com/api/v1/integrations/petpooja/webhook
              </code>
            </div>

            {syncDone && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle size={15} />
                <span>
                  Success: Unified Menu pulling, schema validation and prices update completed
                  successfully!
                </span>
              </div>
            )}
          </div>
        </AdminCard>
      </div>

      {showConfirm && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setShowConfirm(false)}
          onConfirm={() => {
            setShowConfirm(false);
            triggerSync();
          }}
          title="Force Petpooja Menu Sync?"
          description="Are you sure you want to download the entire catalog schema from Petpooja? This will query all active store POS systems and override your local catalog menu pricing."
          confirmLabel="Force Sync Now"
        />
      )}
    </div>
  );
};
