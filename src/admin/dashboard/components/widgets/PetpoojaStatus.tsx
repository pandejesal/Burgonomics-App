import React from "react";
import { useSyncHealth, useSyncHistory, useSyncMutations } from "../../hooks/useDashboardData";
import { toast } from "sonner";
import {
  AlertTriangle,
  RefreshCw,
  Zap,
  Play,
  Activity,
} from "lucide-react";

export const PetpoojaStatus: React.FC = () => {
  const {
    data: health,
    isLoading: isHealthLoading,
    isError: isHealthError,
    refetch: refetchHealth,
  } = useSyncHealth();
  const {
    data: history,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useSyncHistory();
  const {
    triggerPetpoojaSync,
    isTriggeringPetpooja,
    refreshCache,
    isRefreshingCache,
    replayWebhook,
    isReplayingWebhook,
  } = useSyncMutations();

  const isConnected = health?.connected === true;

  const handleManualSync = async () => {
    if (!isConnected) {
      toast.info("Petpooja integration is awaiting live merchant POS credentials.");
      return;
    }
    try {
      await triggerPetpoojaSync(undefined);
      toast.success("Menu sync enqueued.");
    } catch (err: any) {
      toast.error(`Sync error: ${err.message}`);
    }
  };

  const handleRefreshCache = async () => {
    if (!isConnected) {
      toast.info("Available after Petpooja credentials are wired.");
      return;
    }
    try {
      await refreshCache(undefined);
      toast.success("Catalog cache refreshed.");
    } catch (err: any) {
      toast.error(`Cache refresh error: ${err.message}`);
    }
  };

  const handleReplayWebhook = async () => {
    if (!isConnected) {
      toast.info("No active webhook gateway sessions to replay.");
      return;
    }
    try {
      await replayWebhook({ gateway: "petpooja", id: "latest" });
      toast.success("Webhook replayed.");
    } catch (err: any) {
      toast.error(`Webhook error: ${err.message}`);
    }
  };

  const isLoading = isHealthLoading || isHistoryLoading;
  const isError = isHealthError || isHistoryError;

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 animate-pulse">
        <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            Petpooja Integration
          </span>
          <AlertTriangle size={18} className="text-red-500" />
        </div>
        <p className="text-xs font-semibold text-gray-400">
          Failed to probe Petpooja POS connectivity status.
        </p>
        <button
          onClick={() => {
            refetchHealth();
            refetchHistory();
          }}
          className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/15 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          Retry Probe
        </button>
      </div>
    );
  }

  // Extract from real health API:
  const apiStatus = isConnected
    ? health?.api === "up" ? "UP" : "DOWN"
    : "NOT CONNECTED";
  const webhookStatus = isConnected
    ? health?.webhooks === "up" ? "ACTIVE" : "DOWN"
    : "AWAITING CREDENTIALS";
  const circuitBreaker = isConnected
    ? health?.circuitBreaker === "OPEN" ? "OPEN (TRIPPED)" : "CLOSED (SECURE)"
    : "STANDBY";

  // Extract stats from sync history
  const latestSync = history && history.length > 0 ? history[0] : null;
  const latestCompletedSync = history?.find((h) => h.status === "COMPLETED");
  const latestFailedSync = history?.find((h) => h.status === "FAILED");

  const currentMenuVersion = latestCompletedSync?.version || "—";

  let lastSyncTime = "—";
  if (latestSync?.startedAt) {
    const diff = Date.now() - new Date(latestSync.startedAt).getTime();
    const minutes = Math.floor(diff / 60000);
    lastSyncTime = minutes < 1 ? "Just now" : `${minutes} min ago`;
  }

  let syncDuration = "—";
  if (latestCompletedSync?.startedAt && latestCompletedSync?.finishedAt) {
    const duration =
      new Date(latestCompletedSync.finishedAt).getTime() -
      new Date(latestCompletedSync.startedAt).getTime();
    syncDuration = `${(duration / 1000).toFixed(1)}s`;
  }

  const lastError = latestFailedSync?.errorMessage || "None";
  const retryCount = latestSync?.status === "RUNNING" ? "1 / 3" : "0";

  return (
    <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-50 dark:border-gray-800/50 mb-5">
          <div>
            <h4 className="text-sm font-black text-gray-900 dark:text-white font-sans uppercase">
              Petpooja POS Live Gateway
            </h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
              Direct telemetry stream from the Petpooja Restaurant ERP middleware
            </p>
          </div>
          <Zap size={16} className="text-[#FF6600] shrink-0" />
        </div>

        {/* Grid status indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="p-3.5 rounded-2xl border border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/10">
            <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-wider">
              API Status
            </span>
            <span
              className={`block font-black text-xs font-mono mt-1 ${
                isConnected
                  ? apiStatus === "UP" ? "text-[#16A34A]" : "text-[#DC2626]"
                  : "text-amber-500"
              }`}
            >
              ● {apiStatus}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl border border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/10">
            <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-wider">
              Webhook link
            </span>
            <span
              className={`block font-black text-xs font-mono mt-1 ${
                isConnected
                  ? webhookStatus === "ACTIVE" ? "text-[#16A34A]" : "text-[#DC2626]"
                  : "text-amber-500"
              }`}
            >
              ● {webhookStatus}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl border border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/10">
            <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-wider">
              Circuit Breaker
            </span>
            <span
              className={`block font-black text-xs font-mono mt-1 ${
                isConnected
                  ? circuitBreaker.includes("CLOSED") ? "text-[#16A34A]" : "text-orange-500"
                  : "text-amber-500/80"
              }`}
            >
              {circuitBreaker}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl border border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/10">
            <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-wider">
              Menu Version
            </span>
            <span className="block font-black text-xs font-mono text-gray-400 dark:text-gray-500 mt-1">
              {currentMenuVersion}
            </span>
          </div>
        </div>

        {/* Details list */}
        <div className="space-y-2.5 text-xs mb-6">
          <div className="flex items-center justify-between py-1 border-b border-gray-50/60 dark:border-gray-900/20">
            <span className="text-gray-400 font-semibold">Last Catalog Sync</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">{lastSyncTime}</span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-gray-50/60 dark:border-gray-900/20">
            <span className="text-gray-400 font-semibold">Sync Build Duration</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">{syncDuration}</span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-gray-50/60 dark:border-gray-900/20">
            <span className="text-gray-400 font-semibold">Gateway Pipeline Retry Count</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">{retryCount}</span>
          </div>
          <div className="flex items-start justify-between py-1">
            <span className="text-gray-400 font-semibold shrink-0">Last Pipeline Alert</span>
            <span
              className={`font-bold text-right truncate pl-4 max-w-[240px] ${lastError !== "None" ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}
            >
              {lastError}
            </span>
          </div>
        </div>
      </div>

      {/* Buttons actions */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3 shrink-0">
          <button
            onClick={handleManualSync}
            disabled={!isConnected || isTriggeringPetpooja}
            title={!isConnected ? "Available after Petpooja credentials are wired" : undefined}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all ${
              !isConnected
                ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-60"
                : "bg-[#0E4825] hover:bg-[#0E4825]/90 text-white cursor-pointer"
            }`}
          >
            {isTriggeringPetpooja ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Play size={13} />
            )}
            <span>Run Menu Sync</span>
          </button>

          <button
            onClick={handleRefreshCache}
            disabled={!isConnected || isRefreshingCache}
            title={!isConnected ? "Available after Petpooja credentials are wired" : undefined}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs border transition-all ${
              !isConnected
                ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-transparent cursor-not-allowed opacity-60"
                : "bg-orange-50 hover:bg-orange-100 text-[#FF6600] border-orange-200/50 cursor-pointer"
            }`}
          >
            {isRefreshingCache ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            <span>Refresh Cache</span>
          </button>

          <button
            onClick={handleReplayWebhook}
            disabled={!isConnected || isReplayingWebhook}
            title={!isConnected ? "Available after Petpooja credentials are wired" : undefined}
            className={`col-span-2 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border font-bold text-xs transition-all ${
              !isConnected
                ? "bg-gray-100/50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500 border-transparent cursor-not-allowed opacity-60"
                : "border-gray-100 dark:border-gray-800 hover:border-gray-200 text-gray-600 dark:text-gray-300 bg-gray-50/40 dark:bg-gray-900/20 cursor-pointer"
            }`}
          >
            <Activity size={13} />
            <span>Replay Last Webhook</span>
          </button>
        </div>

        {!isConnected && (
          <p className="text-[10px] text-center text-amber-500/90 font-semibold tracking-wide">
            Available after Petpooja credentials are wired
          </p>
        )}
      </div>
    </div>
  );
};
