import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { motion } from "motion/react";
import { AdminCard } from "@/admin/components/Cards";
import { AdminButton, DangerButton } from "@/admin/components/Buttons";
import { ConfirmDialog } from "@/admin/components/Utilities";
import { MOCK_STORES } from "@/features/stores/data/mockStores";
import {
  HeartPulse,
  Database,
  RefreshCw,
  Cpu,
  Server,
  Network,
  Zap,
  CheckCircle,
  AlertTriangle,
  Flame,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/petpooja/health")({
  component: PetpoojaHealthPage,
});

interface HealthStatus {
  service: string;
  status: "healthy" | "degraded" | "failing";
  latencyMs: number;
  details: string;
}

interface CircuitBreakerOverride {
  storeId: string;
  storeName: string;
  restId: string;
  state: "closed" | "open" | "half-open";
  failureCount: number;
  maxFailures: number;
}

const INITIAL_OVER_STATES: CircuitBreakerOverride[] = [
  {
    storeId: "str_001",
    storeName: "Burgonomics Navrangpura",
    restId: "rest_navrangpura",
    state: "closed",
    failureCount: 0,
    maxFailures: 5,
  },
  {
    storeId: "str_002",
    storeName: "Burgonomics Nehrunagar",
    restId: "rest_nehrunagar",
    state: "closed",
    failureCount: 0,
    maxFailures: 5,
  },
  {
    storeId: "str_003",
    storeName: "Burgonomics Mansi Circle",
    restId: "rest_mansi_circle",
    state: "closed",
    failureCount: 0,
    maxFailures: 5,
  },
  {
    storeId: "str_004",
    storeName: "Burgonomics Science City",
    restId: "rest_science_city",
    state: "half-open",
    failureCount: 3,
    maxFailures: 5,
  },
  {
    storeId: "str_005",
    storeName: "Burgonomics Gota",
    restId: "rest_gota",
    state: "open",
    failureCount: 5,
    maxFailures: 5,
  },
];

function PetpoojaHealthPage() {
  const [circuitBreakers, setCircuitBreakers] =
    useState<CircuitBreakerOverride[]>(INITIAL_OVER_STATES);
  const [healths, setHealths] = useState<HealthStatus[]>([
    {
      service: "PostgreSQL Database Cluster",
      status: "healthy",
      latencyMs: 2,
      details: "8 / 10 active connections pooled",
    },
    {
      service: "Redis Cache & Job Cluster",
      status: "healthy",
      latencyMs: 1,
      details: "Memory: 142 MB, Keys: 842",
    },
    {
      service: "Petpooja Merchant API",
      status: "healthy",
      latencyMs: 142,
      details: "Handshake payload accepted",
    },
    {
      service: "Webhook Verification Service",
      status: "healthy",
      latencyMs: 4,
      details: "Signature key valid",
    },
  ]);

  const [cacheMetrics, setCacheMetrics] = useState({
    memory: "142.4 MB",
    keys: 842,
    hits: 24902,
    misses: 1142,
    ttl: "14400s (4h)",
  });

  const [confirmFlush, setConfirmFlush] = useState(false);
  const [confirmBreaker, setConfirmBreaker] = useState<{
    storeId: string;
    targetState: "closed" | "open";
  } | null>(null);

  const handleManualTripToggle = (
    storeId: string,
    currentState: "closed" | "open" | "half-open",
  ) => {
    const targetState = currentState === "closed" ? "open" : "closed";
    setConfirmBreaker({ storeId, targetState });
  };

  const executeBreakerToggle = () => {
    if (!confirmBreaker) return;
    const { storeId, targetState } = confirmBreaker;

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
      `Circuit breaker manually override. Status for ${storeId} is now ${targetState.toUpperCase()}`,
    );
    setConfirmBreaker(null);
  };

  const handleFlushCache = () => {
    toast.info("Eraser thread dispatched to Redis pool...");
    setTimeout(() => {
      setCacheMetrics((prev) => ({
        ...prev,
        keys: 0,
        hits: 0,
        misses: 0,
      }));
      toast.success("Global Redis cache sweep successful. Invalidation complete.");
    }, 1200);
  };

  const handleTestHandshake = () => {
    toast.info("Sending echo requests to all cluster endpoints...");
    setTimeout(() => {
      setHealths((prev) =>
        prev.map((h) => ({
          ...h,
          latencyMs: Math.max(1, h.latencyMs + Math.floor(Math.random() * 20) - 10),
        })),
      );
      toast.success("Connection echo tests completed.");
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* Top Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Connection status panels */}
        <AdminCard
          title="Cluster Endpoint Handshakes"
          subtitle="Real-time check on critical database, queue, and API nodes"
          extra={
            <AdminButton variant="outline" size="sm" onClick={handleTestHandshake}>
              <RefreshCw size={12} className="mr-1" />
              <span>Ping All</span>
            </AdminButton>
          }
        >
          <div className="space-y-4">
            {healths.map((h, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-900/10 flex items-center justify-between gap-4 font-sans"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                      h.status === "healthy"
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {h.service.includes("Database") && <Database size={16} />}
                    {h.service.includes("Redis") && <Cpu size={16} />}
                    {h.service.includes("API") && <Server size={16} />}
                    {h.service.includes("Webhook") && <Network size={16} />}
                  </div>

                  <div>
                    <h5 className="text-xs font-black text-gray-900 dark:text-white">
                      {h.service}
                    </h5>
                    <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{h.details}</p>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="text-[11px] font-black text-[#0E4825] dark:text-emerald-400 flex items-center justify-end gap-1">
                    <CheckCircle size={10} />
                    <span>{h.latencyMs}ms</span>
                  </div>
                  <span className="text-[9px] font-extrabold text-emerald-600 uppercase tracking-wider block">
                    OPERATIONAL
                  </span>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        {/* Redis Cache registry stats */}
        <AdminCard
          title="Redis Cache & Invalidation Center"
          subtitle="Cache distribution layer, memory utilization and hit indices"
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
                Cache Performance Telemetry (Ratio)
              </span>

              <div className="flex justify-between items-center text-xs font-bold text-gray-700 dark:text-gray-300">
                <span>Hit Count / Miss Count</span>
                <span className="font-mono">
                  {cacheMetrics.hits} hits / {cacheMetrics.misses} misses
                </span>
              </div>

              {/* Progress visual bar */}
              <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
                <div className="bg-[#0E4825] h-full" style={{ width: "95.6%" }} />
                <div className="bg-amber-500 h-full" style={{ width: "4.4%" }} />
              </div>

              <div className="flex justify-between text-[10px] font-extrabold font-mono text-gray-400 uppercase">
                <span>Cache Efficiency: 95.6%</span>
                <span>Average TTL: {cacheMetrics.ttl}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-50 dark:border-gray-800/50 flex justify-between items-center">
              <p className="text-[10px] font-semibold text-gray-400 leading-relaxed max-w-xs">
                Sweeping the cache instantly purges all menu indices, category trees, and merchant
                credentials.
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
        subtitle="Manage and trip active POS connection locks manually to protect endpoint limits"
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
                    / {cb.maxFailures} consecutive timeouts
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
            handleFlushCache();
            setConfirmFlush(false);
          }}
          title="Flush Global Cache Store?"
          description="DANGEROUS: Force purging Redis state removes cached catalogs for all 8 locations. Users loading store selectors will experience sudden load spikes during database regeneration."
          confirmLabel="Flush Redis Cache"
        />
      )}

      {/* Circuit breaker override Modal */}
      {confirmBreaker && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmBreaker(null)}
          onConfirm={executeBreakerToggle}
          title={
            confirmBreaker.targetState === "open"
              ? "Emergency Trip Circuit Breaker?"
              : "Force Closed Circuit Breaker?"
          }
          description={
            confirmBreaker.targetState === "open"
              ? "WARNING: Manually opening the connection breaker trips all API calls for this terminal immediately and ignores customer orders. Replays are required."
              : "This manually forces a breaker closed. Active polling starts immediately and might trip again if connection is still degrading."
          }
          confirmLabel="Execute State Transition"
        />
      )}
    </div>
  );
}
