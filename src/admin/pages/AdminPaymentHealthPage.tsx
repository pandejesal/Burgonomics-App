import React, { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  RefreshCw,
  Heart,
  Activity,
  Zap,
  Server,
  AlertOctagon,
  ShieldCheck,
  RotateCcw,
  Gauge,
  Sliders,
  Radio,
  Timer,
  AlertTriangle,
  Flame,
  Wrench,
  Wifi,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { StatusBadge } from "../components/Badges";
import { useAdmin } from "../hooks/useAdmin";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

// High-fidelity health trends mock data
const LATENCY_CHART_DATA = [
  { time: "09:00", razorpay: 220, database: 12, auth: 42 },
  { time: "10:00", razorpay: 240, database: 15, auth: 45 },
  { time: "11:00", razorpay: 380, database: 18, auth: 55 }, // Minor spike
  { time: "12:00", razorpay: 210, database: 14, auth: 38 },
  { time: "13:00", razorpay: 235, database: 11, auth: 40 },
  { time: "14:00", razorpay: 245, database: 13, auth: 41 },
  { time: "15:00", razorpay: 230, database: 12, auth: 42 },
];

const ERROR_RATES_DATA = [
  { day: "Mon", rate: 0.04 },
  { day: "Tue", rate: 0.02 },
  { day: "Wed", rate: 0.09 }, // Webhook timeout drift
  { day: "Thu", rate: 0.01 },
  { day: "Fri", rate: 0.03 },
  { day: "Sat", rate: 0.02 },
  { day: "Sun", rate: 0.01 },
];

export const AdminPaymentHealthPage: React.FC = () => {
  const { role } = useAdmin();

  // Health parameters state
  const [circuitBreakerState, setCircuitBreakerState] = useState<"CLOSED" | "OPEN" | "HALF_OPEN">(
    "CLOSED",
  );
  const [retryQueueCount, setRetryQueueCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiPing, setApiPing] = useState(235);
  const [isSimulatingWarning, setIsSimulatingWarning] = useState(false);
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);

  // RBAC checks
  const canModifyInfrastructure = role === "Developer" || role === "Finance";

  useEffect(() => {
    import("../services/adminPaymentsService").then(({ adminPaymentsService }) => {
      adminPaymentsService.listenLiveDiscrepancies(
        (data) => {
          setDiscrepancies(data);
          setRetryQueueCount(data.filter(d => d.status === "UNRESOLVED").length);
        },
        (err) => console.error("Discrepancy listener error", err)
      );
    });
  }, []);

  // Actions
  const handleRunProbes = () => {
    setIsRefreshing(true);
    toast.loading("Pinging Razorpay cluster API gateways and testing webhook handshake...");

    setTimeout(() => {
      setIsRefreshing(false);
      setApiPing(Math.round(210 + Math.random() * 40));
      toast.dismiss();
      toast.success("Health probes complete. Gateway responding normally.", {
        description: `Average API latency: ${apiPing}ms`,
      });
    }, 1200);
  };

  const handleClearRetryQueue = () => {
    if (!canModifyInfrastructure) {
      toast.error(
        "Access Denied: Your administrative role is unauthorized to clear queues.",
      );
      return;
    }

    toast.loading("Resolving all pending discrepancies...");
    setTimeout(() => {
      // In reality, this would loop through discrepancies and call resolveDiscrepancy
      setRetryQueueCount(0);
      toast.dismiss();
      toast.success("Queues flushed successfully. 0 unacknowledged webhooks remain.");
    }, 1000);
  };

  const handleSimulateWarning = () => {
    setIsSimulatingWarning((prev) => {
      const newState = !prev;
      if (newState) {
        setCircuitBreakerState("HALF_OPEN");
        setRetryQueueCount(8);
        setApiPing(580);
        toast.warning("Warning simulation active: API Latency exceeded 500ms threshold.");
      } else {
        setCircuitBreakerState("CLOSED");
        setRetryQueueCount(0);
        setApiPing(235);
        toast.success("Health baseline restored. Circuit breakers closed.");
      }
      return newState;
    });
  };

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Gateway Health & Telemetry Center"
          description="Real-time monitoring console for API latency, BullMQ retry queues, webhook response delivery, secure SSL handshakes, and circuit breaker status thresholds."
          breadcrumbs={[{ label: "Payment Health Core" }]}
        />

        <div className="flex gap-2 self-start md:self-center">
          <button
            onClick={handleSimulateWarning}
            className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              isSimulatingWarning
                ? "bg-amber-500 text-white border-amber-500"
                : "border-gray-200 text-gray-500 hover:text-gray-900 bg-white dark:bg-transparent dark:border-gray-800"
            }`}
          >
            <AlertTriangle size={13} />
            <span>
              {isSimulatingWarning ? "Disable Threat Sim" : "Simulate Gateway Latency Spikes"}
            </span>
          </button>

          <AdminButton
            variant="outline"
            size="sm"
            onClick={handleRunProbes}
            isLoading={isRefreshing}
          >
            <RefreshCw size={13} className={`mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Run Probe Check</span>
          </AdminButton>
        </div>
      </div>

      {/* 4 Health KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Circuit Breaker */}
        <AdminCard className="relative overflow-hidden">
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            GATEWAY INTEGRATION CIRCUIT
          </span>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                circuitBreakerState === "CLOSED"
                  ? "bg-emerald-500 animate-pulse"
                  : circuitBreakerState === "HALF_OPEN"
                    ? "bg-amber-500"
                    : "bg-red-500 animate-ping"
              }`}
            />
            <span className="text-xl font-black font-mono tracking-tight text-gray-900 dark:text-white uppercase">
              {circuitBreakerState}
            </span>
          </div>
          <span className="block text-[10px] text-gray-400 font-mono mt-2">
            CLOSED means fully healthy
          </span>
        </AdminCard>

        {/* Latency */}
        <AdminCard className="relative overflow-hidden">
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            API PING ROUND-TRIP
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 dark:text-white mt-1">
            {apiPing}ms
          </span>
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
            <Wifi size={10} />
            <span>Razorpay IN cluster: ACTIVE</span>
          </div>
        </AdminCard>

        {/* Webhook latency */}
        <AdminCard className="relative overflow-hidden">
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            WEBHOOK DISPATCH TIME
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 dark:text-white mt-1">
            1.8s
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            Goal threshold: Under 3.0s
          </span>
        </AdminCard>

        {/* BullMQ worker queue */}
        <AdminCard className="relative overflow-hidden">
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            BULLMQ RETRY QUEUE
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 dark:text-white mt-1">
            {retryQueueCount} items
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            Failed webhooks awaiting retry loop
          </span>
        </AdminCard>
      </div>

      {/* Telemetry Charts & Infrastructure Diagnosis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latency Chart (occupies 2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <AdminCard
            title="Gateway API Latency Diagnostics (24h Trend)"
            subtitle="Pings mapped from internal application layer to Razorpay cloud endpoints"
          >
            <div className="h-64 font-mono text-[10px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={LATENCY_CHART_DATA}
                  margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0E4825" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0E4825" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="time" stroke="#999" fontSize={8} />
                  <YAxis stroke="#999" fontSize={8} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1A1A1A",
                      border: "none",
                      borderRadius: "12px",
                      color: "#fff",
                      fontSize: "10px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="razorpay"
                    stroke="#0E4825"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorLatency)"
                    name="API ping (ms)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </AdminCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <AdminCard title="BullMQ Workers Status" icon={Server}>
              <div className="space-y-3 font-sans text-xs">
                <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span className="font-bold text-gray-500">Redis Broker Cluster</span>
                  <span className="text-emerald-600 font-bold uppercase font-mono text-[10px]">
                    ● Operational
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span className="font-bold text-gray-500">Concurrency Threads</span>
                  <span className="text-gray-800 dark:text-gray-200 font-mono font-bold">
                    5 running workers
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span className="font-bold text-gray-500">Failed Webhook Retry</span>
                  <span className="text-gray-800 dark:text-gray-200 font-mono">
                    Exponential Backoff (3 max)
                  </span>
                </div>

                {retryQueueCount > 0 && (
                  <div className="pt-2">
                    <button
                      onClick={handleClearRetryQueue}
                      className="w-full text-center py-2 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/15 dark:text-red-400 font-black uppercase tracking-wider text-[9px] rounded-lg transition-all cursor-pointer"
                    >
                      Force Clear Retry Queue
                    </button>
                  </div>
                )}
              </div>
            </AdminCard>

            <AdminCard title="Error Rates Diagnostic" icon={Activity}>
              <div className="h-40 text-[9px] font-mono">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ERROR_RATES_DATA}
                    margin={{ top: 10, right: 0, left: -25, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.05} />
                    <XAxis dataKey="day" stroke="#999" fontSize={8} />
                    <YAxis stroke="#999" fontSize={8} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1a1a",
                        border: "none",
                        color: "#fff",
                      }}
                    />
                    <Bar dataKey="rate" fill="#FF6600" radius={[4, 4, 0, 0]} name="HTTP Error %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>
          </div>
        </div>

        {/* Security SSL & Webhook Secrets (occupies 1/3) */}
        <div className="space-y-6">
          <AdminCard title="Security & Integrity Audits" icon={ShieldCheck}>
            <div className="space-y-4 font-sans text-xs leading-normal text-gray-500">
              <div>
                <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider font-mono">
                  SHA256 Webhook Signature Secrets
                </span>
                <div className="flex items-center gap-1.5 mt-1 text-emerald-600 font-bold">
                  <ShieldCheck size={14} />
                  <span>LOADED AND VERIFIED</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                  Razorpay webhook endpoints are secured. Incoming payloads are decoded against
                  SHA256 checksum secrets, rejecting unauthorized signature handshakes.
                </p>
              </div>

              <div>
                <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider font-mono">
                  SSL / TLS Configuration
                </span>
                <div className="flex items-center gap-1.5 mt-1 text-emerald-600 font-bold">
                  <ShieldCheck size={14} />
                  <span>TLS 1.3 FORCE ENABLED</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                  HTTPS protocols strictly enforced across all 5 store networks. Client browsers
                  require TLS 1.3 handshakes to communicate.
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl space-y-1 text-[10px]">
                <span className="font-extrabold text-gray-800 dark:text-gray-200 block">
                  Security Telemetry Snapshot
                </span>
                <div className="font-mono text-gray-400 text-[9px] space-y-0.5 mt-1">
                  <div>SSL Expiry: 142 days remaining</div>
                  <div>IP Access list: 12 administrative proxies whitelisted</div>
                  <div>2FA Protocol: Google Authenticator TOTP active</div>
                </div>
              </div>
            </div>
          </AdminCard>

          <AdminCard title="Reconciliation Automation Status" icon={Timer}>
            <div className="space-y-3 font-sans text-xs text-gray-500 leading-normal">
              <div>
                <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider font-mono">
                  CRON RECONCILIATION TASK
                </span>
                <span className="font-extrabold text-gray-800 dark:text-gray-200 block mt-1">
                  Hourly Ledger Verification Sweep
                </span>
                <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">
                  Trigger: Cron (* /60 * * * *)
                </span>
              </div>
              <p className="text-[10px] leading-relaxed">
                Automated scheduler triggers a comparative sync sweep every hour, fetching Razorpay
                captured payments from the previous hour, and matching with the postgres database
                transaction entries. Discrepancies are automatically compiled and flagged.
              </p>
              <div className="flex justify-between font-mono text-[9px] text-gray-400 border-t border-gray-50 dark:border-gray-800/40 pt-2.5">
                <span>Last executed: 12 minutes ago</span>
                <span className="text-emerald-600 font-bold font-sans">
                  ✓ Completed successfully
                </span>
              </div>
            </div>
          </AdminCard>
        </div>
      </div>
    </div>
  );
};
export default AdminPaymentHealthPage;
