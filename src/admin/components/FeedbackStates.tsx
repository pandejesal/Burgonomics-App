import React from "react";
import { motion } from "motion/react";
import { ShieldAlert, RefreshCw, FolderOpen, LucideIcon } from "lucide-react";

// EmptyState
interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = FolderOpen,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-12 rounded-[24px] border border-dashed border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A]">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0E4825]/5 dark:bg-[#0E4825]/10 text-[#0E4825] dark:text-emerald-400 mb-4">
        <Icon size={28} />
      </div>
      <h3 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white font-sans">
        {title}
      </h3>
      <p className="text-sm text-gray-400 max-w-sm mt-1.5 leading-relaxed font-medium">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 px-5 py-2.5 rounded-xl bg-[#0E4825] text-white hover:bg-[#0B3A1D] text-xs font-bold shadow-sm transition-all duration-150"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

// LoadingState
export const LoadingState: React.FC<{ label?: string }> = ({
  label = "Loading System Resources...",
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0E4825] text-white font-bold text-xl shadow-md">
        <span>B</span>
        <div className="absolute inset-0 rounded-2xl border-2 border-white/20 border-t-[#FF6600] animate-spin" />
      </div>
      <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mt-2">{label}</span>
    </div>
  );
};

// FailureFeedbackState
export const FailureFeedbackState: React.FC<{
  title?: string;
  description?: string;
  onRetry?: () => void;
}> = ({
  title = "System Pipeline Error",
  description = "Could not communicate with the database services. Verify your security credentials or internet connection.",
  onRetry,
}) => {
  return (
    <div className="rounded-2xl border border-red-200/50 bg-red-50/50 dark:bg-red-950/15 p-6 flex flex-col md:flex-row items-start gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
        <ShieldAlert size={22} />
      </div>
      <div className="space-y-1.5 flex-1 min-w-0">
        <h4 className="text-sm font-bold text-red-800 dark:text-red-400 font-sans tracking-tight">
          {title}
        </h4>
        <p className="text-xs text-red-600/80 dark:text-red-400/70 font-medium leading-relaxed">
          {description}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 mt-3 text-xs font-bold text-red-700 dark:text-red-400 hover:underline"
          >
            <RefreshCw size={12} className="animate-spin-hover" />
            <span>Retry Connection</span>
          </button>
        )}
      </div>
    </div>
  );
};

// SkeletonTable
export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 5,
}) => {
  return (
    <div className="w-full border border-gray-100 dark:border-gray-800 rounded-[20px] overflow-hidden bg-white dark:bg-[#1A1A1A] animate-pulse">
      <div className="h-14 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center px-6 gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded-md flex-1" />
        ))}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="h-16 flex items-center px-6 gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="h-3 bg-gray-100 dark:bg-gray-800 rounded-md flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
