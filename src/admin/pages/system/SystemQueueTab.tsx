import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Boxes,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useAdminAuthStore } from "../../store/adminAuthStore";

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

interface FailedJob {
  id: string;
  name: string;
  data: Record<string, unknown>;
  failedReason: string;
  stacktrace: string[];
  attemptsMade: number;
  timestamp: number;
}

export const SystemQueueTab: React.FC = () => {
  const { accessToken } = useAdminAuthStore();
  const [queues, setQueues] = useState<QueueStats[]>([]);
  const [selectedQueueName, setSelectedQueueName] = useState<string | null>(null);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<FailedJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionStatus, setActionStatus] = useState<string>("");

  const fetchQueues = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/v1/admin/ops/queues", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setQueues(data);
        if (data.length > 0 && !selectedQueueName) {
          setSelectedQueueName(data[0].name);
        }
      }
    } catch (err) {
      console.error("Failed to fetch queues stats", err);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, selectedQueueName]);

  const fetchFailedJobs = useCallback(
    async (qName: string) => {
      if (!accessToken || !qName) return;
      try {
        const response = await fetch(
          `/api/v1/admin/ops/queues/${encodeURIComponent(qName)}/failed`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (response.ok) {
          const data = await response.json();
          setFailedJobs(data);
        }
      } catch (err) {
        console.error("Failed to fetch failed jobs", err);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    fetchQueues();
  }, [fetchQueues]);

  useEffect(() => {
    if (selectedQueueName) {
      fetchFailedJobs(selectedQueueName);
      setSelectedJob(null);
    }
  }, [selectedQueueName, fetchFailedJobs]);

  const handlePauseQueue = async (qName: string) => {
    if (!accessToken) return;
    try {
      const response = await fetch(`/api/v1/admin/ops/queues/${encodeURIComponent(qName)}/pause`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        setActionStatus(`Paused queue: ${qName}`);
        fetchQueues();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResumeQueue = async (qName: string) => {
    if (!accessToken) return;
    try {
      const response = await fetch(`/api/v1/admin/ops/queues/${encodeURIComponent(qName)}/resume`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        setActionStatus(`Resumed queue: ${qName}`);
        fetchQueues();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetryFailed = async (qName: string) => {
    if (!accessToken) return;
    try {
      const response = await fetch(
        `/api/v1/admin/ops/queues/${encodeURIComponent(qName)}/retry-failed`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobIds: selectedJob ? [selectedJob.id] : undefined }),
        },
      );
      if (response.ok) {
        const result = await response.json();
        setActionStatus(`Retried ${result.retried} jobs in ${qName}`);
        fetchQueues();
        if (selectedQueueName) {
          fetchFailedJobs(selectedQueueName);
        }
        setSelectedJob(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReplayDlq = async (qName: string) => {
    if (!accessToken) return;
    try {
      const response = await fetch(
        `/api/v1/admin/ops/queues/${encodeURIComponent(qName)}/replay-dlq`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (response.ok) {
        setActionStatus(`Replayed DLQ for queue: ${qName}`);
        fetchQueues();
        if (selectedQueueName) {
          fetchFailedJobs(selectedQueueName);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Compute total aggregates
  const totals = queues.reduce(
    (acc, q) => {
      acc.waiting += q.waiting;
      acc.active += q.active;
      acc.completed += q.completed;
      acc.failed += q.failed;
      acc.delayed += q.delayed;
      return acc;
    },
    { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
  );

  const activeQueueData = queues.find((q) => q.name === selectedQueueName);

  return (
    <div className="space-y-6">
      {/* Upper queue stats HUD */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-[#0c130e] border border-gray-800 p-4 rounded-[20px]">
        <div className="p-3 bg-black/40 rounded-xl text-center border border-emerald-950/20">
          <span className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono font-bold">
            Waiting
          </span>
          <span className="text-xl font-bold text-gray-300 font-mono">
            {totals.waiting.toLocaleString()}
          </span>
        </div>
        <div className="p-3 bg-black/40 rounded-xl text-center border border-emerald-950/20">
          <span className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono font-bold">
            Active
          </span>
          <span className="text-xl font-bold text-emerald-400 font-mono">
            {totals.active.toLocaleString()}
          </span>
        </div>
        <div className="p-3 bg-black/40 rounded-xl text-center border border-emerald-950/20">
          <span className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono font-bold">
            Completed
          </span>
          <span className="text-xl font-bold text-gray-400 font-mono">
            {totals.completed.toLocaleString()}
          </span>
        </div>
        <div className="p-3 bg-black/40 rounded-xl text-center border border-emerald-950/20">
          <span className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono font-bold">
            Failed
          </span>
          <span className="text-xl font-bold text-red-400 font-mono">
            {totals.failed.toLocaleString()}
          </span>
        </div>
        <div className="p-3 bg-black/40 rounded-xl text-center border border-emerald-950/20 col-span-2 md:col-span-1">
          <span className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono font-bold">
            Delayed
          </span>
          <span className="text-xl font-bold text-amber-400 font-mono">
            {totals.delayed.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Queue control actions bar */}
      {selectedQueueName && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0c130e] border border-gray-800 p-4 rounded-[20px]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold font-mono text-gray-400 mr-2 uppercase">
              Queue: {selectedQueueName}
            </span>
            {activeQueueData?.paused ? (
              <button
                onClick={() => handleResumeQueue(selectedQueueName)}
                className="px-3 py-1.5 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-xs font-bold font-mono uppercase flex items-center gap-1.5 hover:bg-emerald-950/40 cursor-pointer"
              >
                <Play size={12} /> Resume Queue
              </button>
            ) : (
              <button
                onClick={() => handlePauseQueue(selectedQueueName)}
                className="px-3 py-1.5 rounded-lg bg-red-950/20 border border-red-900/40 text-red-400 text-xs font-bold font-mono uppercase flex items-center gap-1.5 hover:bg-red-950/40 cursor-pointer"
              >
                <Pause size={12} /> Pause Queue
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRetryFailed(selectedQueueName)}
              className="px-3 py-1.5 rounded-lg bg-[#FF6600]/10 border border-[#FF6600]/30 text-[#FF6600] text-xs font-bold font-mono uppercase flex items-center gap-1.5 hover:bg-[#FF6600]/20 cursor-pointer"
            >
              <RotateCcw size={12} /> Retry Failed
            </button>
            <button
              onClick={() => handleReplayDlq(selectedQueueName)}
              className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 text-xs font-bold font-mono uppercase flex items-center gap-1.5 hover:bg-gray-800 cursor-pointer"
            >
              <Trash2 size={12} /> Replay DLQ
            </button>
            <button
              onClick={fetchQueues}
              className="p-1.5 rounded-lg bg-black border border-gray-800 text-gray-400 hover:text-white"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      )}

      {actionStatus && (
        <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-xs font-mono">
          {actionStatus}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queues Selector & Failures View */}
        <div className="lg:col-span-2 p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
            <div>
              <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
                BULLMQ EXECUTOR REGISTRY
              </h3>
              <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                Real-time active state checks of background queues
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedQueueName || ""}
                onChange={(e) => setSelectedQueueName(e.target.value)}
                className="bg-black border border-gray-800 rounded-lg text-xs font-mono text-white p-1.5 outline-none"
              >
                {queues.map((q) => (
                  <option key={q.name} value={q.name}>
                    {q.name} ({q.failed} failed)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar">
            {failedJobs.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-xs font-mono">
                No failed jobs found in the queue "{selectedQueueName}".
              </div>
            ) : (
              failedJobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedJob?.id === job.id
                      ? "bg-[#0E4825]/15 border-emerald-700/50"
                      : "bg-black/30 border-gray-900/60 hover:border-gray-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-black/50">
                      <Boxes size={14} className="text-gray-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white font-mono">{job.name}</span>
                        <span className="text-[9px] text-gray-500 font-mono">#{job.id}</span>
                      </div>
                      <span className="block text-[9px] text-red-400 mt-0.5 font-mono truncate max-w-[280px]">
                        {job.failedReason || "No fault message"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-gray-400 font-mono">
                      Attempts: {job.attemptsMade}
                    </span>
                    <XCircle size={16} className="text-red-400" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Job Inspector Panel */}
        <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-gray-800 pb-3 flex items-center justify-between">
              <span className="font-mono text-xs font-black text-emerald-400 uppercase tracking-widest">
                Job Inspector
              </span>
              {selectedJob && (
                <span className="text-[10px] font-mono text-gray-500 font-bold">
                  ID: {selectedJob.id}
                </span>
              )}
            </div>

            {selectedJob ? (
              <div className="space-y-4">
                <div>
                  <span className="block text-[9px] text-gray-500 font-mono uppercase font-bold">
                    Executable Function
                  </span>
                  <span className="text-xs font-bold text-white font-mono">{selectedJob.name}</span>
                </div>

                <div>
                  <span className="block text-[9px] text-red-400 font-mono uppercase font-bold">
                    Failure Fault Message
                  </span>
                  <p className="text-[10px] text-red-200 bg-red-950/15 p-2.5 rounded-lg border border-red-900/40 font-mono leading-relaxed mt-1 whitespace-pre-wrap">
                    {selectedJob.failedReason || "Unknown failure reason"}
                  </p>
                </div>

                <div>
                  <span className="block text-[9px] text-gray-500 font-mono uppercase font-bold">
                    Failure Timestamp
                  </span>
                  <span className="text-xs text-gray-300 font-mono">
                    {new Date(jobTimestampToDate(selectedJob.timestamp)).toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center space-y-2">
                <Boxes size={24} className="text-gray-700 mx-auto" />
                <p className="text-xs text-gray-500 font-mono">
                  Select a failed BullMQ row to inspect stack telemetry
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function jobTimestampToDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  return typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
}
