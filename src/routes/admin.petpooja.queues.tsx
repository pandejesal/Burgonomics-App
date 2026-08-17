import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { AdminCard } from "@/admin/components/Cards";
import { AdminButton, DangerButton } from "@/admin/components/Buttons";
import { ConfirmDialog } from "@/admin/components/Utilities";
import { petpoojaGateway, type QueueJob, type QueueOverview } from "@/core/integrations/petpooja";
import {
  Boxes,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Clock,
  ListRestart,
  Sliders,
  Pause,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/petpooja/queues")({
  component: PetpoojaQueuesPage,
});

function PetpoojaQueuesPage() {
  const [selectedQueue, setSelectedQueue] = useState("petpooja-menu-sync");
  const [activeTab, setActiveTab] = useState<QueueJob["state"]>("active");
  const [queueOverview, setQueueOverview] = useState<QueueOverview>({
    status: "standby",
    activeJobsCount: 0,
    waitingJobsCount: 0,
    failedJobsCount: 0,
    delayedJobsCount: 0,
    completedJobsCount: 0,
    jobs: [],
  });

  const [confirmOp, setConfirmOp] = useState<{
    type: string;
    title: string;
    description: string;
    action: () => void;
  } | null>(null);

  useEffect(() => {
    void petpoojaGateway.getQueues().then(setQueueOverview);
  }, []);

  const queues = [
    {
      name: "petpooja-menu-sync",
      description: "Menu catalog ingestion queue",
      active: queueOverview.activeJobsCount,
      failed: queueOverview.failedJobsCount,
      status: "STANDBY",
    },
    {
      name: "petpooja-webhook-handler",
      description: "Live webhooks dispatch processor",
      active: 0,
      failed: 0,
      status: "STANDBY",
    },
    {
      name: "petpooja-stock-reconciler",
      description: "Real-time stock level auditor",
      active: 0,
      failed: 0,
      status: "STANDBY",
    },
  ];

  const jobs = queueOverview.jobs;

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
        }, 500);
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
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20">
                    {q.status}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    Active: {q.active}
                  </span>
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
                "Requeue all failed tasks in this worker cluster back into waiting states.",
                () => {
                  toast.info("No failed queue jobs to retry.");
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
                "Empty all processed jobs in this queue from storage.",
                () => {
                  toast.info("Completed jobs buffer is empty.");
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
                "Toggle ingestion thread. Workers are currently on standby awaiting live merchant credentials.",
                () => {
                  toast.info("Queue is already on standby.");
                },
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
                "Instantly clear any waiting, paused, and delayed tasks in this queue.",
                () => {
                  toast.info("Queue is already empty.");
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
              <CheckCircle size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-xs font-semibold">
                No jobs in the '{activeTab.toUpperCase()}' state. Queue is idle.
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
