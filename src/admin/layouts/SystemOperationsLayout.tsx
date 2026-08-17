import React, { useState, useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Activity,
  BarChart3,
  Terminal,
  Boxes,
  Database,
  Server,
  Network,
  ToggleLeft,
  ShieldAlert,
  Clock,
  Settings,
  Shield,
  Bot,
  Send,
  Sparkles,
  AlertOctagon,
  RefreshCw,
  X,
  ChevronRight,
  Maximize2,
  Trash2,
  Play,
} from "lucide-react";
import { useAdminAuthStore } from "../store/adminAuthStore";

import { appConfig } from "@/core/config/env";

interface SystemOperationsLayoutProps {
  children: React.ReactNode;
}

export const SystemOperationsLayout: React.FC<SystemOperationsLayoutProps> = ({ children }) => {
  const location = useLocation();
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiChat, setAiChat] = useState<{ role: "user" | "assistant"; text: string }[]>([
    {
      role: "assistant",
      text: "Welcome to BURGONOMICS Mission Control AI. I have full read-only access to live systems (BullMQ, Redis, Prometheus Metrics, API gateways, database logs). How can I assist you with debugging, performance auditing, or systems management today?",
    },
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Auto-refresh control (10 seconds as requested)
  const [refreshCountdown, setRefreshCountdown] = useState(10);
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          // Trigger a simulated global telemetry ping
          return 10;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSendAiMessage = async () => {
    if (!aiMessage.trim()) return;
    const userText = aiMessage;
    setAiChat((prev) => [...prev, { role: "user", text: userText }]);
    setAiMessage("");
    setIsAiLoading(true);

    try {
      // Call the server-side developer AI endpoint
      const response = await fetch("/api/developer/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userText, currentPath: location.pathname }),
      });
      const data = await response.json();
      if (data.success) {
        setAiChat((prev) => [...prev, { role: "assistant", text: data.response }]);
      } else {
        setAiChat((prev) => [
          ...prev,
          {
            role: "assistant",
            text: `AI Error: ${data.error?.message || "Failed to process prompt."}`,
          },
        ]);
      }
    } catch (err) {
      setAiChat((prev) => [
        ...prev,
        { role: "assistant", text: "Network connection error while reaching the AI Agent." },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const allSystemTabs = [
    { label: "Dashboard", to: "/admin/system", icon: LayoutDashboard },
    { label: "Live Health", to: "/admin/system/health", icon: Activity },
    { label: "Metrics & Charts", to: "/admin/system/metrics", icon: BarChart3 },
    { label: "Queue Manager", to: "/admin/system/queues", icon: Boxes, requiresOps: true },
    { label: "Redis Explorer", to: "/admin/system/redis", icon: Database, requiresOps: true },
    { label: "Database Core", to: "/admin/system/database", icon: Server, requiresOps: true },
    { label: "API Explorer", to: "/admin/system/apis", icon: Network, requiresOps: true },
    { label: "Realtime Logs", to: "/admin/system/logs", icon: Terminal, requiresOps: true },
    { label: "Audits & Events", to: "/admin/system/audit", icon: ShieldAlert, requiresOps: true },
    {
      label: "Feature Flags",
      to: "/admin/system/feature-flags",
      icon: ToggleLeft,
      requiresOps: true,
    },
    { label: "Cron Jobs", to: "/admin/system/jobs", icon: Clock, requiresOps: true },
    { label: "Security Center", to: "/admin/system/security", icon: Shield },
    { label: "System Config", to: "/admin/system/settings", icon: Settings },
  ];

  const systemTabs = allSystemTabs.filter(
    (tab) => !tab.requiresOps || appConfig.featureFlags.adminOps,
  );

  const currentTab = systemTabs.find((t) => location.pathname === t.to) || systemTabs[0];

  return (
    <div className="flex flex-col h-full bg-[#0a0f0c] dark text-gray-200 font-sans selection:bg-[#FF6600]/30 rounded-[20px] overflow-hidden border border-gray-800 shadow-2xl relative">
      {/* Upper Status HUD Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 bg-[#0f1712] px-6 py-4 shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0E4825] to-[#1b5e34] text-emerald-400 border border-emerald-800 shadow-[0_0_20px_rgba(14,72,37,0.3)] animate-pulse">
            <Activity size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black uppercase tracking-widest text-emerald-400 font-mono">
                DEVELOPER MISSION CONTROL
              </h2>
              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                PROD-A
              </span>
            </div>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5 font-bold">
              Central Operating System • Burgonomics Core Node
            </p>
          </div>
        </div>

        {/* Global Auto-Refresh Indicator & Action Suite */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 bg-[#121c15] border border-emerald-950 rounded-xl px-3.5 py-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-gray-300 font-bold">SYNC IN {refreshCountdown}s</span>
          </div>

          <button
            onClick={() => setIsAiOpen(!isAiOpen)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              isAiOpen
                ? "bg-[#FF6600] text-white shadow-[0_0_15px_rgba(255,102,0,0.4)]"
                : "bg-[#0E4825]/20 hover:bg-[#0E4825]/40 text-emerald-400 border border-emerald-900/40"
            }`}
          >
            <Bot size={14} className={isAiOpen ? "animate-bounce" : ""} />
            <span>AI Assistant</span>
          </button>
        </div>
      </div>

      {/* Main Core Dashboard Framework */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sub-Navigation Sidebar */}
        <div className="w-[240px] shrink-0 border-r border-gray-800 bg-[#070b08] hidden lg:flex flex-col p-4 space-y-1">
          <div className="text-[10px] font-black tracking-widest text-gray-500 uppercase px-3 py-2 font-mono">
            Sub-Systems
          </div>
          <nav className="flex-1 overflow-y-auto space-y-0.5 pr-2 custom-scrollbar">
            {systemTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = location.pathname === tab.to;
              return (
                <Link
                  key={tab.to}
                  to={tab.to as any}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${
                    isActive
                      ? "bg-[#0E4825] text-white border border-emerald-700/50 shadow-[0_4px_12px_rgba(14,72,37,0.3)] font-black"
                      : "text-gray-400 hover:text-white hover:bg-gray-800/40"
                  }`}
                >
                  <Icon
                    size={15}
                    className={
                      isActive ? "text-emerald-400" : "text-gray-500 group-hover:text-emerald-400"
                    }
                  />
                  <span className="truncate">{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Dynamic Telemetry Workspace Container */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0f0c]">
          {/* Mobile sub-system selector scroll-bar */}
          <div className="lg:hidden flex items-center gap-1 overflow-x-auto border-b border-gray-800 p-2 shrink-0 bg-[#070b08] no-scrollbar">
            {systemTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = location.pathname === tab.to;
              return (
                <Link
                  key={tab.to}
                  to={tab.to as any}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0 transition-all ${
                    isActive
                      ? "bg-[#0E4825] text-white border border-emerald-800"
                      : "text-gray-400 bg-gray-900/40 hover:text-white"
                  }`}
                >
                  <Icon size={12} />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">
            {children}
          </div>
        </div>

        {/* Collapsible Slide-out AI Developer Assistant Panel */}
        <div
          className={`absolute top-0 right-0 h-full w-[360px] max-w-full border-l border-gray-800 bg-[#080d09] shadow-2xl flex flex-col z-30 transition-transform duration-300 ${
            isAiOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* AI Panel Header */}
          <div className="p-4 border-b border-gray-800 bg-[#0c140e] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Bot size={18} className="text-emerald-400 animate-pulse" />
              <div>
                <span className="block text-xs font-bold text-white uppercase tracking-wider font-mono">
                  MISSION CONTROL AI
                </span>
                <span className="block text-[9px] text-[#FF6600] font-black uppercase tracking-widest">
                  Live System Intelligence
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsAiOpen(false)}
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* AI Chat History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs leading-relaxed custom-scrollbar bg-[#060a07]">
            {aiChat.map((chat, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${chat.role === "user" ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-1">
                  <span>{chat.role === "user" ? "DEVELOPER" : "CORE_AI"}</span>
                </div>
                <div
                  className={`p-3 rounded-2xl max-w-[90%] border ${
                    chat.role === "user"
                      ? "bg-[#FF6600]/10 border-[#FF6600]/30 text-white"
                      : "bg-[#0E4825]/10 border-[#0E4825]/30 text-emerald-300"
                  }`}
                >
                  {chat.text}
                </div>
              </div>
            ))}
            {isAiLoading && (
              <div className="flex items-center gap-2 text-[10px] text-emerald-400 uppercase tracking-widest animate-pulse font-bold p-2 font-mono">
                <Sparkles size={12} className="animate-spin" />
                <span>AI analyzing system state...</span>
              </div>
            )}
          </div>

          {/* AI Input Block */}
          <div className="p-4 border-t border-gray-800 bg-[#0c140e]">
            <div className="flex items-center gap-2 bg-[#060a07] border border-gray-800 rounded-xl p-1.5 focus-within:border-emerald-600 transition-all">
              <input
                type="text"
                placeholder="Ask about queues, DB issues, Redis..."
                value={aiMessage}
                onChange={(e) => setAiMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendAiMessage()}
                className="flex-1 bg-transparent border-0 outline-none focus:ring-0 px-2 text-xs text-white placeholder-gray-600 font-mono"
              />
              <button
                onClick={handleSendAiMessage}
                disabled={isAiLoading || !aiMessage.trim()}
                className="h-8 w-8 rounded-lg bg-[#0E4825] hover:bg-[#156d39] text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:hover:bg-[#0E4825] cursor-pointer shrink-0"
              >
                <Send size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
