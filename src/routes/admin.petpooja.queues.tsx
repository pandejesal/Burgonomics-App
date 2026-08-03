import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AdminCard } from "@/admin/components/Cards";
import { AdminButton, DangerButton } from "@/admin/components/Buttons";
import { ConfirmDialog } from "@/admin/components/Utilities";
import {
  Boxes,
  RefreshCw,
  Play,
  Pause,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronRight,
  ListRestart,
  Sliders,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/petpooja/queues")({
  component: PetpoojaQueuesPage,
});

interface QueueJob {
  id: string;
  name: string;
  queue: string;
  state: "active" | "waiting" | "completed" | "failed" | "delayed" | "paused";
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  processedAt: string | null;
  durationMs: number | null;
  payload: Record<string, any>;
  errorMessage: string | null;
}

const MOCK_JOBS: QueueJob[] = [
  {
    id: "job_01",
    name: "sync-menu-navrangpura",
    queue: "petpooja-menu-sync",
    state: "active",
    attempts: 1,
    maxAttempts: 3,
    createdAt: "2026-07-19 09:15:00",
    processedAt: "2026-07-19 09:15:02",
    durationMs: null,
    payload: { store_id: "str_001", mode: "full", initiated_by: "system_scheduler" },
    errorMessage: null,
  },
  {
    id: "job_02",
    name: "process-order-webhook-89224155",
    queue: "petpooja-webhook-handler",
    state: "active",
    attempts: 1,
    maxAttempts: 5,
    createdAt: "2026-07-19 09:15:01",
    processedAt: "2026-07-19 09:15:01",
    durationMs: null,
    payload: { event: "order.save", payload_id: "wh_001" },
    errorMessage: null,
  },
  {
    id: "job_03",
    name: "reconcile-stock-nehrunagar",
    queue: "petpooja-stock-reconciler",
    state: "waiting",
    attempts: 0,
    maxAttempts: 3,
    createdAt: "2026-07-19 09:14:30",
    processedAt: null,
    durationMs: null,
    payload: { store_id: "str_002", items: ["itm_classic_veg"] },
    errorMessage: null,
  },
  {
    id: "job_04",
    name: "sync-menu-gota",
    queue: "petpooja-menu-sync",
    state: "failed",
    attempts: 3,
    maxAttempts: 3,
    createdAt: "2026-07-19 08:30:10",
    processedAt: "2026-07-19 08:30:18",
    durationMs: 8400,
    payload: { store_id: "str_005", mode: "full", initiated_by: "admin_trigger" },
    errorMessage: "Signature mismatch: webhook payload verification failed",
  },
  {
    id: "job_05",
    name: "sync-menu-sciencecity",
    queue: "petpooja-menu-sync",
    state: "delayed",
    attempts: 2,
    maxAttempts: 5,
    createdAt: "2026-07-19 08:59:12",
    processedAt: "2026-07-19 08:59:15",
    durationMs: 3200,
    payload: { store_id: "str_004", mode: "incremental" },
    errorMessage: "Connection failure to Burgonomics client API. Retrying in 300s.",
  },
  {
    id: "job_06",
    name: "process-status-webhook-mansicircle",
    queue: "petpooja-webhook-handler",
    state: "completed",
    attempts: 1,
    maxAttempts: 3,
    createdAt: "2026-07-19 09:05:30",
    processedAt: "2026-07-19 09:05:30",
    durationMs: 5,
    payload: { event: "store.status", payload_id: "wh_004" },
    errorMessage: null,
  },
];

function PetpoojaQueuesPage() {
  const [selectedQueue, setSelectedQueue] = useState("petpooja-menu-sync");
  const [activeTab, setActiveTab] = useState<QueueJob["state"]>("active");
  const [jobs, setJobs] = useState<QueueJob[]>(MOCK_JOBS);

  // Manual trigger states
  const [confirmOp, setConfirmOp] = useState<{
    type: string;
    title: string;
    description: string;
    action: () => void;
  } | null>(null);

  const queues = [
    {
      name: "petpooja-menu-sync",
      description: "Menu catalog ingestion queue",
      active: 2,
      failed: 1,
    },
    {
      name: "petpooja-webhook-handler",
      description: "Live webhooks dispatch processor",
      active: 1,
      failed: 0,
    },
    {
      name: "petpooja-stock-reconciler",
      description: "Real-time stock level auditor",
      active: 0,
      failed: 0,
    },
  ];

  // Tab indicators count
  const getJobCount = (state: QueueJob["state"]) => {
    return jobs.filter((j) => j.queue === selectedQueue && j.state === state).length;
  };

  const filteredJobs = jobs.filter((j) => j.queue === selectedQueue && j.state === activeTab);

  const handleQueueAction = (
    actionName: string,
    title: string,
    description: string,
    callback: () => void,
  ) => {
    setConfirmOp({
      type: actionName,
      title,
      description,
      action: () => {
        toast.info(`Triggering queue command: ${actionName.toUpperCase()}`);
        setTimeout(() => {
          callback();
          toast.success(`Success: ${title} done.`);
        }, 1000);
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Queues fleet list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {queues.map((q) => {
          const isSelected = selectedQueue === q.name;
          return (
            <motion.div
              key={q.name}
              whileHover={{ y: -2 }}
              onClick={() => setSelectedQueue(q.name)}
              className={`rounded-[20px] p-5 border text-left cursor-pointer transition-all duration-200 shadow-sm ${
                isSelected
                  ? "border-[#0E4825] bg-[#0E4825]/[0.02] dark:border-[#FF6600] dark:bg-[#FF6600]/[0.02] ring-2 ring-[#0E4825]/5 dark:ring-[#FF6600]/10"
                  : "border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] hover:border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between mb-3 font-sans">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-900 text-[#0E4825] dark:text-emerald-400">
                  <Boxes size={18} />
                </div>
                <div className="flex gap-1.5 font-mono text-[9px] font-black uppercase tracking-wider">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/10 dark:text-emerald-400">
                    Active: {q.active}
                  </span>
                  {q.failed > 0 && (
                    <span className="px-2 py-0.5 rounded bg-red-50 text-red-700">
                      Failed: {q.failed}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1 font-sans">
                <h4 className="text-xs font-black text-gray-900 dark:text-white truncate">
                  {q.name}
                </h4>
                <p className="text-[10px] font-semibold text-gray-400">{q.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Control Actions toolbar */}
      <div className="bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-[20px] p-4 shadow-sm flex flex-wrap gap-3 items-center justify-between font-sans">
        <div className="flex items-center gap-2">
          <Sliders size={14} className="text-[#0E4825] dark:text-emerald-400" />
          <span className="text-xs font-black uppercase tracking-wider text-gray-800 dark:text-gray-200">
            Queue Actions ({selectedQueue})
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <AdminButton
            variant="outline"
            size="sm"
            onClick={() =>
              handleQueueAction(
                "retry failed",
                "Replay Failed Jobs",
                "Requeue all failed tasks in this BullMQ worker cluster back into waiting states.",
                () => {
                  setJobs((prev) =>
                    prev.map((j) =>
                      j.queue === selectedQueue && j.state === "failed"
                        ? { ...j, state: "waiting", attempts: 1 }
                        : j,
                    ),
                  );
                },
              )
            }
          >
            <ListRestart size={12} className="mr-1" />
            <span>Retry Failed</span>
          </AdminButton>

          <AdminButton
            variant="outline"
            size="sm"
            onClick={() =>
              handleQueueAction(
                "clean completed",
                "Clean Completed Jobs Heap",
                "Empty all processed jobs in this queue from Redis storage, preserving failed logs.",
                () => {
                  setJobs((prev) =>
                    prev.filter((j) => !(j.queue === selectedQueue && j.state === "completed")),
                  );
                },
              )
            }
          >
            <Trash2 size={12} className="mr-1" />
            <span>Clean Completed</span>
          </AdminButton>

          <AdminButton
            variant="outline"
            size="sm"
            onClick={() =>
              handleQueueAction(
                "pause queue",
                "Pause/Resume Worker Pool",
                "Toggle ingestion thread. While paused, workers will stop pulling waiting jobs until resumed.",
                () => {},
              )
            }
          >
            <Pause size={12} className="mr-1" />
            <span>Pause Queue</span>
          </AdminButton>

          <DangerButton
            size="sm"
            onClick={() =>
              handleQueueAction(
                "drain queue",
                "Drain Entire Waiting Queue",
                "WARNING: Instantly delete all waiting, paused, and delayed tasks in this queue. This operation is non-reversible.",
                () => {
                  setJobs((prev) =>
                    prev.filter((j) => !(j.queue === selectedQueue && j.state === "waiting")),
                  );
                },
              )
            }
          >
            <Trash2 size={12} className="mr-1" />
            <span>Drain Queue</span>
          </DangerButton>
        </div>
      </div>

      {/* Jobs State Tabs visualizer */}
      <div className="border-b border-gray-100 dark:border-gray-800/80 flex gap-1 font-sans overflow-x-auto no-scrollbar">
        {(
          ["active", "waiting", "completed", "failed", "delayed", "paused"] as QueueJob["state"][]
        ).map((tab) => {
          const isActive = activeTab === tab;
          const count = getJobCount(tab);

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 border-b-2 text-[10px] font-black uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                isActive
                  ? "border-[#0E4825] text-[#0E4825] dark:border-[#FF6600] dark:text-[#FF6600] font-black"
                  : "border-transparent text-gray-400 hover:text-gray-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{tab}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${
                    isActive ? "bg-[#0E4825]/10 text-[#0E4825]" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {count}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Jobs list dashboard */}
      <AdminCard
        title="Job Catalog Timelines"
        subtitle={`Audited thread timeline for '${selectedQueue}' queue`}
      >
        <div className="space-y-4">
          {filteredJobs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 font-sans">
              <CheckCircle size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-xs font-semibold">
                No jobs exist in the '{activeTab.toUpperCase()}' state.
              </p>
            </div>
          ) : (
            filteredJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-gray-100 dark:border-gray-800 p-5 bg-gray-50/50 dark:bg-gray-900/20 font-sans"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800/50 pb-3 mb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-gray-900 dark:text-white">
                        {job.name}
                      </span>
                      <span className="font-mono text-[10px] text-gray-400 font-bold">
                        ID: {job.id}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 font-bold font-mono uppercase">
                      Created: {job.createdAt} • Attempt: {job.attempts} of {job.maxAttempts}
                    </div>
                  </div>

                  {job.state === "failed" && (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-50 text-red-700 font-mono flex items-center gap-1 shrink-0">
                      <AlertTriangle size={11} />
                      <span>Fault Threshold Triggered</span>
                    </span>
                  )}
                  {job.state === "active" && (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 font-mono flex items-center gap-1 shrink-0">
                      <Clock size={11} className="animate-spin" />
                      <span>Processing Node</span>
                    </span>
                  )}
                  {job.state === "waiting" && (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 font-mono flex items-center gap-1 shrink-0">
                      <Boxes size={11} />
                      <span>In Queue Pool</span>
                    </span>
                  )}
                  {job.state === "completed" && (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 font-mono flex items-center gap-1 shrink-0">
                      <CheckCircle size={11} />
                      <span>Succeeded</span>
                    </span>
                  )}
                </div>

                {/* Job diagnostic details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Arguments payload */}
                  <div className="space-y-1.5 font-sans">
                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Arguments / Payload Input
                    </span>
                    <pre className="p-3 rounded-lg bg-gray-950 text-gray-300 border border-gray-800 font-mono text-[10px] leading-relaxed max-h-32 overflow-y-auto no-scrollbar">
                      {JSON.stringify(job.payload, null, 2)}
                    </pre>
                  </div>

                  {/* Diagnostic / Error stack */}
                  <div className="space-y-1.5 font-sans">
                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Diagnostics Stacktrace
                    </span>
                    {job.errorMessage ? (
                      <pre className="p-3 rounded-lg bg-red-950/10 text-red-500 border border-red-900/35 font-mono text-[10px] leading-relaxed max-h-32 overflow-y-auto no-scrollbar font-semibold">
                        {job.errorMessage}
                      </pre>
                    ) : (
                      <div className="p-3 rounded-lg bg-emerald-50/10 border border-emerald-900/10 text-emerald-600 font-mono text-[10px] italic">
                        Node execution clean. No exception stack dumped.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCard>

      {/* Confirm dialogs */}
      {confirmOp && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmOp(null)}
          onConfirm={() => {
            confirmOp.action();
            setConfirmOp(null);
          }}
          title={`${confirmOp.title}?`}
          description={confirmOp.description}
          confirmLabel="Run Queue Operation"
        />
      )}
    </div>
  );
}
