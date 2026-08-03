import React, { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, X, Check, LucideIcon } from "lucide-react";

// AdminAvatar
interface AdminAvatarProps {
  fullName?: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  status?: "online" | "offline" | "idle";
}

export const AdminAvatar: React.FC<AdminAvatarProps> = ({
  fullName = "Admin User",
  avatarUrl,
  size = "md",
  status = "online",
}) => {
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  let sizeClass = "h-10 w-10 text-sm";
  let indicatorClass = "h-2.5 w-2.5 border-2";

  if (size === "sm") {
    sizeClass = "h-8 w-8 text-xs";
    indicatorClass = "h-2 w-2 border-1.5";
  } else if (size === "lg") {
    sizeClass = "h-16 w-16 text-xl";
    indicatorClass = "h-4 w-4 border-2.5";
  }

  const statusColor =
    status === "online" ? "bg-emerald-500" : status === "offline" ? "bg-gray-400" : "bg-amber-500";

  return (
    <div className="relative inline-flex shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={fullName}
          referrerPolicy="no-referrer"
          className={`${sizeClass} rounded-2xl object-cover border border-[#0E4825]/10 shadow-sm`}
        />
      ) : (
        <div
          className={`${sizeClass} flex items-center justify-center rounded-2xl bg-[#0E4825] font-black tracking-tight text-white shadow-md`}
        >
          {initials}
        </div>
      )}
      <span
        className={`absolute -bottom-0.5 -right-0.5 rounded-full border-white dark:border-[#1A1A1A] ${statusColor} ${indicatorClass}`}
      />
    </div>
  );
};

// ConfirmDialog
interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm Action",
  cancelLabel = "Cancel",
  isDestructive = false,
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
          />

          {/* Modal content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative w-full max-w-md overflow-hidden rounded-[24px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-2xl z-50"
          >
            <div className="flex justify-between items-start mb-4">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDestructive ? "bg-red-50 text-[#DC2626]" : "bg-[#FF6600]/10 text-[#FF6600]"}`}
              >
                <AlertTriangle size={20} />
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={16} />
              </button>
            </div>

            <h3 className="text-base font-black tracking-tight text-gray-900 dark:text-white font-sans">
              {title}
            </h3>
            <p className="text-xs font-semibold text-gray-500 mt-1 leading-relaxed">
              {description}
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                {cancelLabel}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-colors shadow-sm ${
                  isDestructive
                    ? "bg-[#DC2626] hover:bg-[#B91C1C]"
                    : "bg-[#0E4825] hover:bg-[#0B3A1D]"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ActivityItem
interface ActivityItemProps {
  title: string;
  description: string;
  time: string;
  icon?: LucideIcon;
  variant?: "success" | "warning" | "info" | "danger";
}

export const ActivityItem: React.FC<ActivityItemProps> = ({
  title,
  description,
  time,
  icon: Icon = Check,
  variant = "info",
}) => {
  let colorClass = "bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400";

  if (variant === "success") {
    colorClass = "bg-emerald-50 text-[#16A34A] dark:bg-emerald-950/20 dark:text-emerald-400";
  } else if (variant === "warning") {
    colorClass = "bg-amber-50 text-[#F59E0B] dark:bg-amber-950/20 dark:text-amber-400";
  } else if (variant === "danger") {
    colorClass = "bg-red-50 text-[#DC2626] dark:bg-red-950/20 dark:text-red-400";
  }

  return (
    <div className="relative pl-8 pb-6 last:pb-0">
      {/* Connector line */}
      <div className="absolute left-[13px] top-[26px] bottom-0 w-[2px] bg-gray-100 dark:bg-gray-800 last:hidden" />

      {/* Bullet trace node */}
      <div
        className={`absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-lg border border-white dark:border-[#1A1A1A] ${colorClass} shadow-sm`}
      >
        <Icon size={13} />
      </div>

      <div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-bold text-gray-900 dark:text-white font-sans">{title}</span>
          <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">{time}</span>
        </div>
        <p className="text-xs font-semibold text-gray-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
};

// Timeline
export const Timeline: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="flex flex-col">{children}</div>;
};
