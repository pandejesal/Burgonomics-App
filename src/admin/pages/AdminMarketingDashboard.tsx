import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Megaphone,
  Bell,
  MessageSquare,
  Mail,
  Zap,
  TrendingUp,
  Percent,
  Play,
  Layers,
  ChevronRight,
  ArrowUpRight,
  Sparkles,
  Phone,
  CheckCircle,
  Clock,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { StatusBadge } from "../components/Badges";
import { marketingStorage, MarketingCampaign, NotificationHistoryItem } from "./marketingData";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  Legend,
} from "recharts";

export const AdminMarketingDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [automations, setAutomations] = useState<any[]>([]);

  useEffect(() => {
    // Read from marketingStorage
    setCampaigns(marketingStorage.getCampaigns());
    setHistory(marketingStorage.getHistory());
    setAutomations(marketingStorage.getAutomations());

    const sub = marketingStorage.subscribe(() => {
      setCampaigns(marketingStorage.getCampaigns());
      setHistory(marketingStorage.getHistory());
      setAutomations(marketingStorage.getAutomations());
    });
    return () => {
      sub();
    };
  }, []);

  // Calculate Consolidated KPIs
  const activeCampaigns = campaigns.filter((c) => c.status === "Active");
  const completedCampaigns = campaigns.filter((c) => c.status === "Completed");

  const totalSent = campaigns.reduce((acc, c) => acc + c.stats.sent, 0);
  const totalDelivered = campaigns.reduce((acc, c) => acc + c.stats.delivered, 0);
  const totalClicked = campaigns.reduce((acc, c) => acc + c.stats.clicked, 0);
  const totalRevenue = campaigns.reduce((acc, c) => acc + c.stats.revenue, 0);
  const activeAutomations = automations.filter((a) => a.status === "Active").length;

  const deliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : "0";
  const clickThroughRate =
    totalDelivered > 0 ? ((totalClicked / totalDelivered) * 100).toFixed(1) : "0";

  // Recharts campaign performance data
  const chartData = campaigns
    .filter((c) => c.stats.sent > 0)
    .map((c) => ({
      name: c.name.length > 20 ? c.name.slice(0, 18) + "..." : c.name,
      sent: c.stats.sent,
      clicked: c.stats.clicked,
      revenue: c.stats.revenue,
    }))
    .reverse();

  // Channel usage distribution
  const channelData = [
    {
      name: "WhatsApp",
      count: campaigns.filter((c) => c.channels.includes("WhatsApp")).length,
      fill: "#16A34A",
    },
    {
      name: "Push Notifications",
      count: campaigns.filter((c) => c.channels.includes("Push")).length,
      fill: "#0E4825",
    },
    {
      name: "SMS Gateway",
      count: campaigns.filter((c) => c.channels.includes("SMS")).length,
      fill: "#FF6600",
    },
    {
      name: "Email Broadcast",
      count: campaigns.filter((c) => c.channels.includes("Email")).length,
      fill: "#F59E0B",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing & Growth Engine"
        description="Monitor active campaign delivery funnels, design customer messaging automation journeys, and track marketing ROI."
        breadcrumbs={[{ label: "Marketing Hub" }]}
        actions={
          <div className="flex gap-2">
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={() => void navigate({ to: "/admin/templates" })}
            >
              <span>Manage Templates</span>
            </AdminButton>
            <AdminButton
              variant="primary"
              size="sm"
              onClick={() => void navigate({ to: "/admin/campaigns/create" })}
            >
              <Megaphone size={14} />
              <span>Launch Campaign</span>
            </AdminButton>
          </div>
        }
      />

      {/* KPI Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Active Campaigns"
          value={activeCampaigns.length}
          icon={Megaphone}
          subtext={`${campaigns.length} total marketing runs`}
        />
        <StatCard
          title="Total Messages Dispatched"
          value={totalSent.toLocaleString()}
          icon={Mail}
          trend={{ value: 12.8, label: "vs last month", isPositive: true }}
        />
        <StatCard
          title="Consolidated CTR"
          value={`${clickThroughRate}%`}
          icon={Zap}
          trend={{ value: 1.4, label: "Avg Open-to-Click", isPositive: true }}
        />
        <StatCard
          title="Campaign Revenue"
          value={`₹${totalRevenue.toLocaleString()}`}
          icon={Percent}
          accent={true}
          subtext="Direct coupon-driven sales"
        />
      </div>

      {/* Secondary quick action banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 rounded-[20px] bg-gradient-to-r from-[#0E4825]/5 to-transparent border border-[#0E4825]/10 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0E4825]/10 text-[#0E4825]">
                <Sparkles size={12} />
              </span>
              <span className="text-xs font-bold text-[#0E4825] uppercase tracking-widest font-mono">
                AI SEGMENT SUGGESTION
              </span>
            </div>
            <h3 className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
              Target Ahmedabad "At-Risk" Cohorts?
            </h3>
            <p className="text-sm text-gray-500 max-w-xl">
              Our models indicate 312 premium tier members in Ahmedabad are reaching a 60-day
              inactivity threshold. Launch a winback discount via WhatsApp template to stimulate
              ₹1.2L potential sales.
            </p>
          </div>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={() => void navigate({ to: "/admin/campaigns/create" })}
            className="whitespace-nowrap shrink-0"
          >
            <span>Target Now</span>
            <ChevronRight size={14} />
          </AdminButton>
        </div>

        <AdminCard className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase text-[#FF6600] tracking-wider">
                Automations Status
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h4 className="text-2xl font-black text-gray-900 dark:text-white font-mono">
              {activeAutomations} / {automations.length}
            </h4>
            <p className="text-xs text-gray-400 mt-1">
              Active automated multi-channel journeys currently running in the background.
            </p>
          </div>
          <Link
            to="/admin/automation"
            className="flex items-center justify-between mt-4 text-xs font-bold text-[#0E4825] hover:text-[#FF6600] uppercase tracking-wider transition-all"
          >
            <span>Launch Journey Builder</span>
            <ChevronRight size={14} />
          </Link>
        </AdminCard>
      </div>

      {/* Main Content & Visual Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaign ROI Area Chart */}
        <div className="lg:col-span-2">
          <AdminCard
            title="Campaign ROI & Conversion Curves"
            subtitle="Financial sales generated against overall recipient volumes"
          >
            <div className="h-80 w-full text-xs mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMktRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0E4825" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0E4825" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                  <XAxis dataKey="name" stroke="#A3A3A3" fontSize={11} tickLine={false} />
                  <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "16px",
                      border: "1px solid #EAEAEA",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Sales Generated (₹)"
                    stroke="#FF6600"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorMktRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </AdminCard>
        </div>

        {/* Channel Breakdown Chart */}
        <AdminCard
          title="Channel Distribution"
          subtitle="Campaign allocation across messaging backends"
        >
          <div className="h-80 w-full text-xs mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                <XAxis dataKey="name" stroke="#A3A3A3" fontSize={9} tickLine={false} />
                <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "1px solid #EAEAEA",
                  }}
                />
                <Bar dataKey="count" name="Campaigns Configured" radius={[10, 10, 0, 0]}>
                  {channelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>
      </div>

      {/* Gateway History & Campaign Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Campaigns List */}
        <div className="lg:col-span-2">
          <AdminCard
            title="Active Marketing Campaigns"
            subtitle="Fulfillment stats of live broadcasts currently tracking checkouts"
            extra={
              <Link
                to="/admin/campaigns"
                className="text-xs font-bold text-[#0E4825] hover:text-[#FF6600] uppercase tracking-wider"
              >
                View All
              </Link>
            }
          >
            <div className="divide-y divide-gray-100 dark:divide-gray-800 space-y-4">
              {campaigns.slice(0, 3).map((campaign) => (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between pt-4 first:pt-0"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h5 className="font-bold text-sm text-gray-900 dark:text-white">
                        {campaign.name}
                      </h5>
                      <StatusBadge
                        status={
                          campaign.status === "Active"
                            ? "active"
                            : campaign.status === "Scheduled"
                              ? "pending"
                              : "inactive"
                        }
                        label={campaign.status}
                      />
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-1 max-w-[400px]">
                      {campaign.description}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 font-mono">
                      <span>OBJ: {campaign.objective}</span>
                      <span>•</span>
                      <span>AUDIENCE: {campaign.audienceType}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="block font-bold text-sm text-[#0E4825] dark:text-emerald-400 font-mono">
                      ₹{campaign.stats.revenue.toLocaleString()}
                    </span>
                    <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">
                      {campaign.stats.sent > 0
                        ? `${campaign.stats.delivered} / ${campaign.stats.sent} DISPATCHED`
                        : "NOT SENT"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>
        </div>

        {/* Real-time Gateway Log Streams */}
        <AdminCard
          title="Communications Gateway Log"
          subtitle="Live socket tracking dispatch statuses of gateways"
        >
          <div className="space-y-4 max-h-[340px] overflow-y-auto pr-2">
            {history.map((log) => {
              const isSuccess = log.status !== "Failed";
              return (
                <div
                  key={log.id}
                  className="text-xs flex items-start gap-3 p-3 rounded-2xl border border-gray-50 dark:border-gray-900 bg-gray-50/20 dark:bg-gray-900/10"
                >
                  <span
                    className={`p-1.5 rounded-xl shrink-0 ${
                      log.channel === "WhatsApp"
                        ? "bg-green-50 text-green-600 dark:bg-green-950/20"
                        : log.channel === "SMS"
                          ? "bg-orange-50 text-orange-600 dark:bg-orange-950/20"
                          : log.channel === "Push"
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20"
                            : "bg-amber-50 text-amber-600 dark:bg-amber-950/20"
                    }`}
                  >
                    {log.channel === "WhatsApp" && <Phone size={12} />}
                    {log.channel === "SMS" && <MessageSquare size={12} />}
                    {log.channel === "Push" && <Bell size={12} />}
                    {log.channel === "Email" && <Mail size={12} />}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-800 dark:text-gray-200 truncate">
                        {log.customerName}
                      </span>
                      <span className="text-[9px] text-gray-400 font-mono flex items-center gap-1">
                        <Clock size={8} />
                        {log.sentAt.split(" ")[1]}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">{log.body}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${isSuccess ? "bg-emerald-500" : "bg-red-500"}`}
                      />
                      <span
                        className={`text-[9px] font-black uppercase tracking-wider ${isSuccess ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
                      >
                        {log.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </AdminCard>
      </div>
    </div>
  );
};
