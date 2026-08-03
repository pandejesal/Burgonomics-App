import React from "react";
import { SystemOperationsLayout } from "../layouts/SystemOperationsLayout";
import { SystemDashboardTab } from "./system/SystemDashboardTab";
import { SystemMetricsTab } from "./system/SystemMetricsTab";
import { SystemQueueTab } from "./system/SystemQueueTab";
import { SystemRedisTab } from "./system/SystemRedisTab";
import { SystemDatabaseTab } from "./system/SystemDatabaseTab";
import { SystemApiTab } from "./system/SystemApiTab";
import { SystemLogsTab } from "./system/SystemLogsTab";
import { SystemFeatureFlagsTab } from "./system/SystemFeatureFlagsTab";
import { SystemSecurityTab } from "./system/SystemSecurityTab";
import { SystemSettingsTab } from "./system/SystemSettingsTab";

interface AdminSystemPageProps {
  activeView:
    | "overview"
    | "health"
    | "metrics"
    | "queues"
    | "redis"
    | "database"
    | "apis"
    | "logs"
    | "audit"
    | "feature-flags"
    | "jobs"
    | "security"
    | "settings";
}

export const AdminSystemPage: React.FC<AdminSystemPageProps> = ({ activeView }) => {
  const renderTabContent = () => {
    switch (activeView) {
      case "overview":
      case "health":
        return <SystemDashboardTab />;
      case "metrics":
        return <SystemMetricsTab />;
      case "queues":
      case "jobs":
        return <SystemQueueTab />;
      case "redis":
        return <SystemRedisTab />;
      case "database":
        return <SystemDatabaseTab />;
      case "apis":
        return <SystemApiTab />;
      case "logs":
      case "audit":
        return <SystemLogsTab />;
      case "feature-flags":
        return <SystemFeatureFlagsTab />;
      case "security":
        return <SystemSecurityTab />;
      case "settings":
        return <SystemSettingsTab />;
      default:
        return <SystemDashboardTab />;
    }
  };

  return <SystemOperationsLayout>{renderTabContent()}</SystemOperationsLayout>;
};
export default AdminSystemPage;
