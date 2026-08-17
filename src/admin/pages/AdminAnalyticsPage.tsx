import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Eye,
  Megaphone,
  Bell,
  Percent,
  Layers,
  Store,
  Users,
  Zap,
  Tag,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { marketingStorage } from "./marketingData";
import {
  useDashboardSnapshot,
  useRevenueSeries,
  useOrderSeries,
} from "../dashboard/hooks/useDashboardData";

const CHART_FILLS = ["#0E4825", "#FF6600", "#F59E0B", "#16A34A", "#7C3AED"];

// Marketing Analytics Data (New)
const CHANNEL_PERF_DATA = [
  { name: "WhatsApp", Dispatched: 2450, Delivered: 2390, Clicked: 412 },
  { name: "App Push", Dispatched: 3030, Delivered: 2910, Clicked: 596 },
  { name: "SMS Gateway", Dispatched: 1780, Delivered: 1680, Clicked: 142 },
  { name: "Email Blast", Dispatched: 1540, Delivered: 1520, Clicked: 890 },
];

const COUPON_TRENDS = [
  { date: "Jul 13", redemptions: 42, revenue: 12400 },
  { date: "Jul 14", redemptions: 55, revenue: 16800 },
  { date: "Jul 15", redemptions: 78, revenue: 23400 },
  { date: "Jul 16", redemptions: 62, revenue: 19100 },
  { date: "Jul 17", redemptions: 95, revenue: 28500 },
  { date: "Jul 18", redemptions: 120, revenue: 38900 },
  { date: "Jul 19", redemptions: 145, revenue: 45600 },
];

const OUTLET_CONVERSION = [
  { name: "Navrangpura", sent: 1200, sales: 240, rate: 20.0 },
  { name: "Science City", sent: 1000, sales: 180, rate: 18.0 },
  { name: "CP Delhi", sent: 800, sales: 160, rate: 20.0 },
  { name: "Sector 62 Noida", sent: 900, sales: 108, rate: 12.0 },
];

/** Formats an ISO date bucket (YYYY-MM-DD) as a short label like "12 Aug". */
const formatBucketLabel = (bucket: string) => {
  const d = new Date(`${bucket}T00:00:00`);
  if (isNaN(d.getTime())) return bucket;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const formatINR = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const AdminAnalyticsPage: React.FC = () => {
  const [tab, setTab] = useState<"sales" | "marketing">("sales");
  const [rangeDays, setRangeDays] = useState(7);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  useEffect(() => {
    setCampaigns(marketingStorage.getCampaigns());
    const sub = marketingStorage.subscribe(() => {
      setCampaigns(marketingStorage.getCampaigns());
    });
    return () => {
      sub();
    };
  }, []);

  // Live analytics window (now − rangeDays → now)
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (rangeDays - 1));
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [rangeDays]);
  const to = useMemo(() => new Date().toISOString(), [rangeDays]);

  const { data: snapshot, isLoading: isSnapshotLoading } = useDashboardSnapshot({ from, to });
  const { data: revenueSeries } = useRevenueSeries({ from, to, granularity: "day" });
  const { data: orderSeries } = useOrderSeries({ from, to, granularity: "day" });

  const salesTrend = useMemo(() => {
    if (!revenueSeries || !orderSeries) return [];
    const merged = new Map<string, { revenue: number; orders: number }>();
    for (const pt of revenueSeries) {
      merged.set(pt.bucket, { revenue: pt.value, orders: 0 });
    }
    for (const pt of orderSeries) {
      const prev = merged.get(pt.bucket) || { revenue: 0, orders: 0 };
      merged.set(pt.bucket, { revenue: prev.revenue, orders: pt.value });
    }
    return Array.from(merged.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, v]) => ({
        name: formatBucketLabel(bucket),
        revenue: v.revenue,
        orders: v.orders,
      }));
  }, [revenueSeries, orderSeries]);

  const topProducts = useMemo(
    () =>
      (snapshot?.topProducts || []).slice(0, 5).map((p, i) => ({
        name: p.name,
        sales: p.units,
        fill: CHART_FILLS[i % CHART_FILLS.length],
      })),
    [snapshot],
  );

  const revenuePaise = snapshot?.revenue.netRevenuePaise ?? 0;
  const orderCount = snapshot?.revenue.orderCount ?? 0;
  const aovPaise = snapshot?.revenue.aov ?? 0;

  // Compute dynamic marketing totals
  const totalSent = campaigns.reduce((acc, c) => acc + c.stats.sent, 0);
  const totalDelivered = campaigns.reduce((acc, c) => acc + c.stats.delivered, 0);
  const totalClicked = campaigns.reduce((acc, c) => acc + c.stats.clicked, 0);
  const totalRevenue = campaigns.reduce((acc, c) => acc + c.stats.revenue, 0);

  const deliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : "96.2";
  const openRate = totalDelivered > 0 ? ((totalClicked / totalDelivered) * 180).toFixed(1) : "45.8"; // simulated open volume
  const ctr = totalDelivered > 0 ? ((totalClicked / totalDelivered) * 100).toFixed(1) : "14.2";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Burgonomics Intelligence Suite"
        description="Verify sales revenues, monitor order volumes, audit marketing channel ROI metrics, and compare outlet checkout conversion rates."
        breadcrumbs={[{ label: "Analytics Hub" }]}
      />

      {/* Tabs segment */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 gap-6">
        <button
          onClick={() => setTab("sales")}
          className={`pb-3 text-sm font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            tab === "sales"
              ? "border-[#0E4825] text-[#0E4825] dark:border-emerald-500 dark:text-emerald-400 font-black"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <TrendingUp size={16} />
          <span>Sales & Operations</span>
        </button>

        <button
          onClick={() => setTab("marketing")}
          className={`pb-3 text-sm font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            tab === "marketing"
              ? "border-[#0E4825] text-[#0E4825] dark:border-emerald-500 dark:text-emerald-400 font-black"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <Megaphone size={16} />
          <span>Marketing & Campaigns ROI</span>
        </button>
      </div>

      {/* SALES AND OPERATIONS VIEW */}
      {tab === "sales" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              title="Consolidated Revenue"
              value={isSnapshotLoading ? "—" : formatINR(revenuePaise)}
              icon={DollarSign}
              subtext={`Net of refunds · last ${rangeDays} days`}
            />
            <StatCard
              title="Consolidated Orders"
              value={isSnapshotLoading ? "—" : orderCount.toLocaleString("en-IN")}
              icon={ShoppingBag}
              subtext={`Last ${rangeDays} days`}
            />
            <StatCard
              title="Average Order Value"
              value={isSnapshotLoading ? "—" : formatINR(aovPaise)}
              icon={Eye}
              subtext="Net revenue per completed order"
            />
          </div>

          {/* Range selector */}
          <div className="flex items-center gap-1.5 justify-end">
            {[7, 30].map((days) => (
              <button
                key={days}
                onClick={() => setRangeDays(days)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all cursor-pointer border ${
                  rangeDays === days
                    ? "bg-[#0E4825] text-white border-[#0E4825] dark:bg-emerald-600 dark:border-emerald-600"
                    : "bg-white dark:bg-[#1A1A1A] text-gray-500 border-gray-100 dark:border-gray-800 hover:border-gray-200"
                }`}
              >
                {days}d
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales trend area chart */}
            <AdminCard
              title="Sales Revenue & Order volume"
              subtitle={`Consolidated performance curves · last ${rangeDays} days`}
            >
              <div className="h-80 w-full font-sans text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
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
                      formatter={(value: any, name: string) =>
                        name === "revenue"
                          ? [formatINR(Number(value)), "Revenue"]
                          : [value, "Orders"]
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="revenue"
                      stroke="#0E4825"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            {/* Top products bar chart */}
            <AdminCard
              title="Top-selling products"
              subtitle={`Units sold · last ${rangeDays} days`}
            >
              <div className="h-80 w-full font-sans text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                    <XAxis dataKey="name" stroke="#A3A3A3" fontSize={11} tickLine={false} />
                    <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "16px",
                        border: "1px solid #EAEAEA",
                      }}
                    />
                    <Bar dataKey="sales" name="Units Sold" radius={[10, 10, 0, 0]}>
                      {topProducts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>
          </div>
        </div>
      )}

      {/* MARKETING AND CAMPAIGNS VIEW */}
      {tab === "marketing" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Campaign Dispatches"
              value={totalSent.toLocaleString()}
              icon={Layers}
              subtext="Total broadcast volumes"
            />
            <StatCard
              title="Delivery Gate Success"
              value={`${deliveryRate}%`}
              icon={CheckCircle2}
              subtext="Consolidated gateway receipt rate"
            />
            <StatCard
              title="Open / Click-Through"
              value={`${ctr}% CTR`}
              icon={Zap}
              subtext={`Simulated ${openRate}% open rates`}
            />
            <StatCard
              title="Voucher Revenue"
              value={`₹${totalRevenue.toLocaleString()}`}
              icon={Tag}
              accent={true}
              subtext="Coupon-driven conversions"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Channel Gateway Performance bar charts */}
            <AdminCard
              title="Delivery Gateway Funnel by Channel"
              subtitle="Dispatches, successful deliveries and clicked links across gateways"
            >
              <div className="h-80 w-full font-sans text-xs mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={CHANNEL_PERF_DATA}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                    <XAxis dataKey="name" stroke="#A3A3A3" fontSize={11} tickLine={false} />
                    <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "16px",
                        border: "1px solid #EAEAEA",
                      }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="Dispatched" fill="#A3A3A3" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Delivered" fill="#0E4825" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Clicked" fill="#FF6600" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            {/* Coupon Redemptions and Revenue generated */}
            <AdminCard
              title="Voucher Usage & Conversion Trends"
              subtitle="Consolidated daily promotional checkout redemptions vs. direct sales"
            >
              <div className="h-80 w-full font-sans text-xs mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={COUPON_TRENDS}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorMktSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6600" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#FF6600" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                    <XAxis dataKey="date" stroke="#A3A3A3" fontSize={11} tickLine={false} />
                    <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "16px",
                        border: "1px solid #EAEAEA",
                      }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Direct Sales (₹)"
                      stroke="#FF6600"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorMktSales)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>
          </div>

          {/* Store specific campaign comparisons */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <AdminCard
                title="Outlet Campaign ROI Comparison"
                subtitle="Analyzing campaign dispatch volumes against paid conversion rates per store outlet"
              >
                <div className="h-80 w-full font-sans text-xs mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={OUTLET_CONVERSION}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                      <XAxis dataKey="name" stroke="#A3A3A3" fontSize={11} tickLine={false} />
                      <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "16px",
                          border: "1px solid #EAEAEA",
                        }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      <Bar
                        dataKey="sent"
                        name="Recipients Targeted"
                        fill="#0E4825"
                        radius={[6, 6, 0, 0]}
                      />
                      <Bar
                        dataKey="sales"
                        name="Checkouts Recorded"
                        fill="#F59E0B"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </AdminCard>
            </div>

            <AdminCard
              title="Conversion Success Ratio"
              subtitle="Direct conversion rates per outlet targeted"
            >
              <div className="space-y-5 mt-4">
                {OUTLET_CONVERSION.map((outlet) => (
                  <div key={outlet.name} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-gray-800 dark:text-gray-200">
                      <span>{outlet.name}</span>
                      <span className="font-mono text-[#0E4825] dark:text-emerald-400">
                        {outlet.rate}% Success
                      </span>
                    </div>
                    {/* Visual custom progress bar */}
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#0E4825] to-[#FF6600] rounded-full transition-all"
                        style={{ width: `${outlet.rate * 4}%` }} // multiplier to highlight conversion difference
                      />
                    </div>
                  </div>
                ))}
              </div>
            </AdminCard>
          </div>
        </div>
      )}
    </div>
  );
};

// Compact local icon helper
const CheckCircle2Icon: React.FC<any> = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
