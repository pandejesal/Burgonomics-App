import React, { useState } from "react";
import { Terminal, Shield, Key, RefreshCw, Layers } from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard } from "../components/Cards";
import { ResponsiveTable, TableColumn } from "../components/TableSystem";
import { StatusBadge, PermissionChip } from "../components/Badges";

interface AuditLog {
  id: string;
  adminEmail: string;
  action: string;
  resource: string;
  ipAddress: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  createdAt: string;
}

const INITIAL_AUDITS: AuditLog[] = [
  {
    id: "LOG-3021",
    adminEmail: "lead-dev@burgonomics.com",
    action: "FORCE_MENU_SYNC_TRIGGERED",
    resource: "Petpooja API link",
    ipAddress: "192.168.1.42",
    severity: "WARNING",
    createdAt: "2026-07-19 14:20",
  },
  {
    id: "LOG-3022",
    adminEmail: "operations@burgonomics.com",
    action: "ADMIN_SESSION_LOGIN_2FA_SUCCESS",
    resource: "Auth session tokens generated",
    ipAddress: "103.45.201.12",
    severity: "INFO",
    createdAt: "2026-07-19 14:02",
  },
  {
    id: "LOG-3023",
    adminEmail: "lead-dev@burgonomics.com",
    action: "DATABASE_SCHEMA_MODIFIED",
    resource: "AdminUser table constraint updated",
    ipAddress: "127.0.0.1 (localhost)",
    severity: "CRITICAL",
    createdAt: "2026-07-19 13:10",
  },
  {
    id: "LOG-3024",
    adminEmail: "manager-delhi@burgonomics.com",
    action: "STORE_STATUS_OVERRIDE",
    resource: "Closed Connaught Place store early",
    ipAddress: "221.120.30.5",
    severity: "WARNING",
    createdAt: "2026-07-19 11:45",
  },
];

export const AdminDeveloperPage: React.FC = () => {
  const [logs] = useState<AuditLog[]>(INITIAL_AUDITS);

  const columns: TableColumn<AuditLog>[] = [
    {
      header: "Log Sequence ID",
      accessorKey: "id",
      cell: (row) => <span className="font-mono font-bold text-gray-500">{row.id}</span>,
    },
    {
      header: "Administrator Identity",
      accessorKey: "adminEmail",
      cell: (row) => (
        <span className="font-bold text-gray-900 dark:text-white">{row.adminEmail}</span>
      ),
    },
    {
      header: "Action Dispatch",
      accessorKey: "action",
      cell: (row) => <PermissionChip permission={row.action} />,
    },
    {
      header: "Affected Resource",
      accessorKey: "resource",
    },
    {
      header: "IP Address",
      accessorKey: "ipAddress",
      cell: (row) => (
        <code className="text-xs font-mono bg-gray-50 dark:bg-gray-900 px-1.5 py-0.5 rounded-md text-gray-400">
          {row.ipAddress}
        </code>
      ),
    },
    {
      header: "Log Severity",
      accessorKey: "severity",
      cell: (row) => {
        let normalizedStatus = "pending";
        if (row.severity === "INFO") normalizedStatus = "active";
        else if (row.severity === "WARNING") normalizedStatus = "warning";
        else if (row.severity === "CRITICAL") normalizedStatus = "failed";
        return <StatusBadge status={normalizedStatus} label={row.severity} />;
      },
    },
    {
      header: "Event Timestamp",
      accessorKey: "createdAt",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developer Audit Logging Core"
        description="Review security log registries, analyze administrative API transactions, trace authentication challenges, and secure systems."
        breadcrumbs={[{ label: "Developer Audit" }]}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Security Severity Levels"
          value="CRITICAL"
          icon={Shield}
          subtext="1 critical log reported"
        />
        <StatCard
          title="Audit Trail Rows"
          value={logs.length}
          icon={Terminal}
          subtext="Retained on database"
        />
        <StatCard title="Active SSH Terminals" value="1 session" icon={Key} />
      </div>

      <ResponsiveTable
        data={logs}
        columns={columns}
        searchPlaceholder="Filter security audit trail by admin email, action type..."
        searchFields={["adminEmail", "action", "resource"]}
        exportFileName="developer-audit-logs"
      />
    </div>
  );
};
