import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { AdminCard } from "@/admin/components/Cards";
import { AdminButton, DangerButton } from "@/admin/components/Buttons";
import { ConfirmDialog } from "@/admin/components/Utilities";
import {
  petpoojaGateway,
  type CircuitBreakerOverride,
  type GatewayHealthService,
} from "@/core/integrations/petpooja";
import {
  Database,
  RefreshCw,
  Cpu,
  Server,
  Network,
  CheckCircle,
  AlertTriangle,
  Flame,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/petpooja/health")({
  component: PetpoojaHealthPage,
});

function PetpoojaHealthPage() {
  const [circuitBreakers, setCircuitBreakers] = useState<CircuitBreakerOverride[]>([]);
  const [services, setServices] = useState<GatewayHealthService[]>([]);
  const [cacheMetrics, setCacheMetrics] = useState({
    memory: "0 KB",
    keys: 0,
    hits: 0,
    misses: 0,
    status: "Idle",
  });

  const [confirmFlush, setConfirmFlush] = useState(false);
  const [confirmBreaker, setConfirmBreaker] = useState<{
    storeId: string;
    targetState: "closed" | "open";
  } | null>(null);

  const loadHealth = () => {
    void petpoojaGateway.getHealth().then((h) => {
      setCircuitBreakers(h.circuitBreakers);
      setServices(h.services);
      setCacheMetrics({
        memory: h.cacheMetrics.sizeFormatted,
        keys: h.cacheMetrics.keyCount,
        hits: 0,
        misses: 0,
        status: h.cacheMetrics.status,
      });
    });
  };

  useEffect(() => {
    loadHealth();
  }, []);

  const handleManualTripToggle = (
    storeId: string,
    currentState: "closed" | "open" | "half-open",
  ) => {
    const targetState = currentState === "closed" ? "open" : "closed";
    setConfirmBreaker({ storeId, targetState });
  };

  const executeBreakerToggle = async () => {
    if (!confirmBreaker) return;
    const { storeId, targetState } = confirmBreaker;

    if (targetState === "open") {
      await petpoojaGateway.tripBreaker(storeId);
    } else {
      await petpoojaGateway.resetBreaker(storeId);
    }

    setCircuitBreakers((prev) =>
      prev.map((cb) =>
        cb.storeId === storeId
          ? {
              ...cb,
              state: targetState,
              failureCount: targetState === "closed" ? 0 : cb.maxFailures,
            }
          : cb,
      ),
    );

    toast.success(
      `Circuit breaker manually updated. Status for ${storeId} is now ${targetState.toUpperCase()}`,
    );
    setConfirmBreaker(null);
  };

  const handleFlushCache = async () => {
    toast.info("Flushing Petpooja local cache...");
    const res = await petpoojaGateway.flushCache();
    setCacheMetrics((prev) => ({
      ...prev,
      keys: 0,
      hits: 0,
      misses: 0,
    }));
    toast.success(res.message);
  };

  const handleTestHandshake = () => {
    toast.info("Testing gateway health endpoints...");
    loadHealth();
    toast.success("Health check refresh complete.");
  };

  return (
    <div className="space-y-6">
      {/* Top Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Connection status panels */}
        <AdminCard
          title="Cluster Endpoint Handshakes"
          subtitle="Status on database, queue, and API gateway nodes"
          extra={
            <AdminButton variant="outline" size="sm" onClick={handleTestHandshake}>
              <RefreshCw size={12} className="mr-1" />
              <span>Ping All</span>
            </AdminButton>
          }
        >
          <div className="space-y-4">
            {services.map((h, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-900/10 flex items-center justify-between gap-4 font-sans"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                      h.status === "healthy"
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400"
                        : h.status === "standby"
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400"
                          : "bg-red-50 text-red-600"
                    }`}
                  >
                    {h.service.includes("Database") && <Database size={16} />}
                    {h.service.includes("Redis") && <Cpu size={16} />}
                    {h.service.includes("API") && <Server size={16} />}
                    {h.service.includes("Webhook") && <Network size={16} />}
                    {h.service.includes("Sync") && <Clock size={16} />}
                  </div>

                  <div>
                    <h5 className="text-xs font-black text-gray-900 dark:text-white">
                      {h.service}
                    </h5>
                    <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{h.details}</p>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span
                    className={`text-[9px] font-extrabold uppercase tracking-wider block ${
                      h.status === "healthy"
                        ? "text-emerald-600"
                        : h.status === "standby"
                          ? "text-amber-600"
                          : "text-red-600"
                    }`}
                  >
                    {h.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        {/* Redis Cache registry stats */}
        <AdminCard
          title="Cache & Invalidation Center"
          subtitle="Cache distribution layer and utilization indices"
        >
          <div className="space-y-5 font-sans">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/80 rounded-2xl">
                <span className="text-[10px] font-bold text-gray-400 block uppercase">
                  Memory Size
                </span>
                <span className="text-lg font-black font-mono text-gray-900 dark:text-white mt-1 block">
                  {cacheMetrics.memory}
                </span>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/80 rounded-2xl">
                <span className="text-[10px] font-bold text-gray-400 block uppercase">
                  Active Key Pairs
                </span>
                <span className="text-lg font-black font-mono text-gray-900 dark:text-white mt-1 block">
                  {cacheMetrics.keys}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800/80 space-y-3">
              <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
                Cache Status
              </span>

              <div className="flex justify-between items-center text-xs font-bold text-gray-700 dark:text-gray-300">
                <span>Ingestion Pipeline</span>
                <span className="font-mono text-amber-600 dark:text-amber-400">
                  Standby — Local Invalidation Ready
                </span>
              </div>

              {/* Progress visual bar */}
              <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
                <div className="bg-emerald-600 h-full" style={{ width: "100%" }} />
              </div>

              <div className="flex justify-between text-[10px] font-extrabold font-mono text-gray-400 uppercase">
                <span>Cache State: Ready</span>
                <span>Standby mode</span>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-50 dark:border-gray-800/50 flex justify-between items-center">
              <p className="text-[10px] font-semibold text-gray-400 leading-relaxed max-w-xs">
                Sweeping the cache purges local memory indices and cached catalog structures.
              </p>
              <DangerButton size="sm" onClick={() => setConfirmFlush(true)}>
                <Flame size={12} className="mr-1" />
                <span>Flush Cache</span>
              </DangerButton>
            </div>
          </div>
        </AdminCard>
      </div>

      {/* Circuit Breaker override states */}
      <AdminCard
        title="Circuit Breakers Override Matrix"
        subtitle="Manage and trip simulated POS connection locks manually"
      >
        <div className="overflow-x-auto no-scrollbar rounded-xl border border-gray-100 dark:border-gray-800">
          <table className="w-full text-left border-collapse font-sans text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 text-[10px] font-black uppercase tracking-wider text-gray-400 font-mono">
                <th className="py-3 px-4">Merchant Outlet</th>
                <th className="py-3 px-4">Terminal REST ID</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4 text-center">Failure Registry</th>
                <th className="py-3 px-4 text-right">Emergency Overrides</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/40 font-medium">
              {circuitBreakers.map((cb) => (
                <tr key={cb.storeId} className="hover:bg-gray-50/20 transition-colors">
                  <td className="py-4 px-4 font-black text-gray-900 dark:text-white">
                    {cb.storeName}
                  </td>
                  <td className="py-4 px-4 font-mono font-bold text-gray-400 uppercase">
                    {cb.restId}
                  </td>
                  <td className="py-4 px-4">
                    {cb.state === "closed" && (
                      <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 font-mono flex items-center gap-1 w-max">
                        <CheckCircle size={10} />
                        <span>CLOSED (Healthy)</span>
                      </span>
                    )}
                    {cb.state === "half-open" && (
                      <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 font-mono flex items-center gap-1 w-max">
                        <AlertTriangle size={10} />
                        <span>HALF-OPEN (Verifying)</span>
                      </span>
                    )}
                    {cb.state === "open" && (
                      <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-50 text-red-600 font-mono flex items-center gap-1 w-max">
                        <ShieldAlert size={10} />
                        <span>TRIPPED (Open)</span>
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 font-mono text-center font-bold">
                    <span
                      className={
                        cb.failureCount > 0 ? "text-red-500 font-extrabold" : "text-gray-400"
                      }
                    >
                      {cb.failureCount}
                    </span>{" "}
                    / {cb.maxFailures} timeouts
                  </td>
                  <td className="py-4 px-4 text-right">
                    <AdminButton
                      variant={cb.state === "closed" ? "outline" : "primary"}
                      size="sm"
                      onClick={() => handleManualTripToggle(cb.storeId, cb.state)}
                      className={
                        cb.state === "closed"
                          ? "border-red-200 text-red-500 hover:bg-red-50"
                          : "bg-emerald-700 text-white hover:bg-emerald-800"
                      }
                    >
                      {cb.state === "closed" ? "Emergency Trip" : "Force Reset"}
                    </AdminButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>

      {/* Flush Cache Modal */}
      {confirmFlush && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmFlush(false)}
          onConfirm={() => {
            void handleFlushCache();
            setConfirmFlush(false);
          }}
          title="Flush Gateway Cache Store?"
          description="Force purging local cache removes cached catalog structures and temporary memory records."
          confirmLabel="Flush Cache"
        />
      )}

      {/* Circuit breaker override Modal */}
      {confirmBreaker && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmBreaker(null)}
          onConfirm={() => {
            void executeBreakerToggle();
          }}
          title={
            confirmBreaker.targetState === "open"
              ? "Emergency Trip Circuit Breaker?"
              : "Force Reset Circuit Breaker?"
          }
          description={
            confirmBreaker.targetState === "open"
              ? "Manually opening the connection breaker simulates a faulted terminal link."
              : "This resets the breaker back to closed (healthy) status."
          }
          confirmLabel="Execute State Transition"
        />
      )}
    </div>
  );
}
