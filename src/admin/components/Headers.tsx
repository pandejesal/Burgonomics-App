import React from "react";
import { ChevronRight, Home } from "lucide-react";
import { Link } from "@tanstack/react-router";

// SectionHeader
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, action }) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h3 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white font-sans">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs font-semibold text-gray-400 mt-0.5 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </div>
  );
};

// PageHeader
interface Breadcrumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  breadcrumbs = [],
  badge,
  actions,
}) => {
  return (
    <div className="flex flex-col gap-4 border-b border-gray-100 dark:border-gray-800/80 pb-6 mb-8">
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-2 text-xs font-semibold text-gray-400">
          <Link
            to="/admin"
            className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Home size={13} />
            <span>Admin</span>
          </Link>

          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight size={12} className="opacity-70" />
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="hover:text-gray-900 dark:hover:text-white transition-colors capitalize"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-gray-900 dark:text-gray-200 capitalize font-bold">
                  {crumb.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Main Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white font-sans">
              {title}
            </h2>
            {badge}
          </div>
          {description && (
            <p className="text-sm font-semibold text-gray-400 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
};
