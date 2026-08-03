import React from "react";
import { useAdmin } from "../../../hooks/useAdmin";
import { useQueueStats, useQueueMutations } from "../../hooks/useDashboardData";
import {
  Radio,
  AlertTriangle,
  RefreshCw,
  Play,
  Pause,
  RotateCw,
  Trash2,
  ArrowRight,
  Layers,
  ShieldAlert,
  Cpu,
} from "lucide-react";

export const QueueMonitor: React.FC = () => {
  const { isDeveloper } = useAdmin();
  const { data: queues, isLoading, isError, refetch } = useQueueStats();
  const { pause, resume, retryFailed, replayDlq } = useQueueMutations();

  const handlePause = async (name: string) => {
    try {
      await pause(name);
      alert(`Successfully paused BullMQ queue: ${name}`);
    } catch (err: any) {
      alert(`Failed to pause queue: ${err.message}`);
    }
  };

  const handleResume = async (name: string) => {
    try {
      await resume(name);
      alert(`Successfully resumed BullMQ queue: ${name}`);
    } catch (err: any) {
      alert(`Failed to resume queue: ${err.message}`);
    }
  };

  const handleRetryFailed = async (name: string) => {
    try {
      const res = await retryFailed({ name });
      alert(`Triggered retry. Successfully queued ${res?.retried ?? 0} failed jobs from DLQ!`);
    } catch (err: any) {
      alert(`Failed to retry jobs: ${err.message}`);
    }
  };

  const handleReplayDlq = async (name: string) => {
    try {
      const res = await replayDlq(name);
      alert(
        `Triggered replay of DLQ. Re-enqueued ${res?.replayed ?? 0} poison-pill jobs successfully!`,
      );
    } catch (err: any) {
      alert(`Failed to replay DLQ: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 animate-pulse">
        <div className="flex justify-between items-center border-b pb-4 mb-4">
          <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-4 w-12 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-50 dark:bg-gray-900 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !queues) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            BullMQ Queue Monitor
          </span>
          <AlertTriangle size={18} className="text-red-500" />
        </div>
        <p className="text-xs font-semibold text-gray-400">
          Failed to sync connections with server-side Redis BullMQ pipelines.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/15 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          Retry Socket
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-50 dark:border-gray-800/50 mb-5">
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-black text-gray-900 dark:text-white font-sans uppercase">
                BullMQ Pipeline Monitor
              </h4>
              <span className="bg-red-50 dark:bg-red-950/20 border border-red-200/40 text-[#DC2626] dark:text-red-400 text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider">
                Sysops
              </span>
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
              Live asynchronous worker queues backed by full-stack Redis clusters
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-[#0E4825] dark:hover:border-emerald-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Queues list */}
        <div className="space-y-4 max-h-[360px] overflow-y-auto no-scrollbar pr-1">
          {queues.map((q) => {
            const isPaused = q.paused;
            const hasFailures = q.failed > 0;

            return (
              <div
                key={q.name}
                className="p-4 rounded-2xl border border-gray-50 dark:border-gray-900 bg-gray-50/20 dark:bg-[#1E1E1E]/20 space-y-3.5 hover:border-gray-200/60 dark:hover:border-gray-800/80 transition-all duration-300"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-1.5 rounded-lg ${isPaused ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}
                    >
                      <Cpu size={14} />
                    </div>
                    <span className="font-bold text-xs font-mono text-gray-800 dark:text-gray-200 tracking-tight">
                      {q.name.toUpperCase().replace(/_/g, " ")}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                      isPaused
                        ? "bg-amber-50 text-amber-600 border-amber-200/30"
                        : "bg-emerald-50 text-emerald-600 border-emerald-200/30 dark:bg-emerald-950/20"
                    }`}
                  >
                    <span
                      className={`h-1 w-1 rounded-full ${isPaused ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`}
                    />
                    {isPaused ? "Paused" : "Active"}
                  </span>
                </div>

                {/* Queue counts indicators */}
                <div className="grid grid-cols-5 gap-1.5 text-center font-mono text-[10px] font-black">
                  <div className="p-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-50 dark:border-gray-950">
                    <span className="block text-[8px] text-gray-400 font-bold uppercase mb-0.5">
                      Wait
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">{q.waiting}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-50 dark:border-gray-950">
                    <span className="block text-[8px] text-gray-400 font-bold uppercase mb-0.5">
                      Active
                    </span>
                    <span className="text-blue-500">{q.active}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-50 dark:border-gray-950">
                    <span className="block text-[8px] text-gray-400 font-bold uppercase mb-0.5">
                      Done
                    </span>
                    <span className="text-emerald-500">{q.completed}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-50 dark:border-gray-950">
                    <span className="block text-[8px] text-gray-400 font-bold uppercase mb-0.5">
                      Fail
                    </span>
                    <span
                      className={
                        hasFailures ? "text-red-500 font-extrabold animate-pulse" : "text-gray-400"
                      }
                    >
                      {q.failed}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-50 dark:border-gray-950">
                    <span className="block text-[8px] text-gray-400 font-bold uppercase mb-0.5">
                      Delay
                    </span>
                    <span className="text-purple-500">{q.delayed}</span>
                  </div>
                </div>

                {/* Developer controls */}
                {isDeveloper ? (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-dashed border-gray-100 dark:border-gray-900/60">
                    <button
                      onClick={() => (isPaused ? handleResume(q.name) : handlePause(q.name))}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-gray-100 dark:border-gray-800 hover:border-gray-200 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-bold text-[10px] bg-white dark:bg-gray-900 cursor-pointer transition-all"
                    >
                      {isPaused ? <Play size={10} /> : <Pause size={10} />}
                      <span>{isPaused ? "Resume" : "Pause"}</span>
                    </button>

                    {hasFailures && (
                      <>
                        <button
                          onClick={() => handleRetryFailed(q.name)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#FF6600] font-bold text-[10px] border border-orange-200/50 cursor-pointer transition-all"
                        >
                          <RotateCw size={10} />
                          <span>Retry All</span>
                        </button>
                        <button
                          onClick={() => handleReplayDlq(q.name)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-[#DC2626] font-bold text-[10px] border border-red-200/50 cursor-pointer transition-all"
                        >
                          <ShieldAlert size={10} />
                          <span>Replay DLQ</span>
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="pt-1.5 text-center">
                    <span className="text-[8px] font-black tracking-wider text-gray-400 uppercase">
                      Developer controls restricted
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
