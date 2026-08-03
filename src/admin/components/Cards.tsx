import React from "react";
import { motion } from "motion/react";
import { TrendingUp, TrendingDown, LucideIcon } from "lucide-react";

// AdminCard
interface AdminCardProps {
  title?: string;
  subtitle?: string;
  extra?: React.ReactNode;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const AdminCard: React.FC<AdminCardProps> = ({
  title,
  subtitle,
  extra,
  icon: Icon,
  children,
  className = "",
  onClick,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300 ${
        onClick ? "cursor-pointer hover:border-gray-200 dark:hover:border-gray-700" : ""
      } ${className}`}
    >
      {(title || subtitle || extra || Icon) && (
        <div className="flex items-center justify-between gap-4 border-b border-gray-50 dark:border-gray-800/50 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            {Icon && <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />}
            <div>
              {title && (
                <h4 className="text-base font-bold text-gray-900 dark:text-white font-sans tracking-tight">
                  {title}
                </h4>
              )}
              {subtitle && <p className="text-xs font-medium text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {extra && <div className="flex items-center gap-2">{extra}</div>}
        </div>
      )}
      {children}
    </motion.div>
  );
};

// StatCard
interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label?: string;
    isPositive: boolean;
  };
  subtext?: string;
  accent?: boolean;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  subtext,
  accent = false,
  className = "",
}) => {
  return (
    <AdminCard
      className={`${accent ? "bg-gradient-to-br from-[#0E4825] to-[#0A321A] text-white" : ""} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <span
            className={`block text-xs font-bold uppercase tracking-wider ${accent ? "text-green-200" : "text-gray-400"}`}
          >
            {title}
          </span>
          <span
            className={`block text-3xl font-black font-mono tracking-tight ${accent ? "text-white" : "text-gray-900 dark:text-white"}`}
          >
            {value}
          </span>
        </div>

        {Icon && (
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-2xl ${accent ? "bg-white/10 text-white" : "bg-gray-50 dark:bg-gray-900 text-[#0E4825]"}`}
          >
            <Icon size={20} />
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 border-t border-gray-50/50 dark:border-gray-800/10 pt-4">
        {trend ? (
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                trend.isPositive
                  ? "bg-emerald-50 text-[#16A34A] dark:bg-emerald-950/20"
                  : "bg-red-50 text-[#DC2626] dark:bg-red-950/20"
              }`}
            >
              {trend.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{trend.value}%</span>
            </span>
            <span
              className={`text-[11px] font-semibold ${accent ? "text-green-200/80" : "text-gray-400"}`}
            >
              {trend.label || "vs last week"}
            </span>
          </div>
        ) : (
          <div />
        )}

        {subtext && (
          <span
            className={`text-xs font-semibold ${accent ? "text-green-100/70" : "text-gray-400"}`}
          >
            {subtext}
          </span>
        )}
      </div>
    </AdminCard>
  );
};

// DataCard (structured field displaying)
interface DataCardProps {
  title: string;
  fields: {
    label: string;
    value: React.ReactNode;
    fullWidth?: boolean;
  }[];
}

export const DataCard: React.FC<DataCardProps> = ({ title, fields }) => {
  return (
    <AdminCard title={title}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 font-sans text-sm">
        {fields.map((field, idx) => (
          <div key={idx} className={`space-y-1 ${field.fullWidth ? "md:col-span-2" : ""}`}>
            <span className="block text-xs font-bold uppercase tracking-wider text-gray-400">
              {field.label}
            </span>
            <div className="font-semibold text-gray-800 dark:text-gray-200">{field.value}</div>
          </div>
        ))}
      </div>
    </AdminCard>
  );
};

// MetricTile (compact tile)
export const MetricTile: React.FC<{
  title: string;
  value: string;
  label: string;
  isWarning?: boolean;
}> = ({ title, value, label, isWarning = false }) => {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-900/30 flex items-center justify-between gap-4">
      <div>
        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          {title}
        </span>
        <span
          className={`text-lg font-black font-mono block mt-0.5 ${isWarning ? "text-[#FF6600]" : "text-[#0E4825] dark:text-emerald-400"}`}
        >
          {value}
        </span>
      </div>
      <span className="text-xs font-medium text-gray-400">{label}</span>
    </div>
  );
};
