import React, { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
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
  PieChart,
  Pie,
  LineChart,
  Line,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  ArrowLeft,
  Users,
  Award,
  Percent,
  MapPin,
  RefreshCw,
  HelpCircle,
  FileText,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { customerStorage, CustomerProfile } from "./customersData";

export const AdminCustomerAnalyticsPage: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerProfile[]>(customerStorage.getCustomers());

  // Aggregate Metrics (calculated directly from the live database)
  const stats = useMemo(() => {
    const total = customers.length;
    const totalSpentSum = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    const avgSpent = total > 0 ? totalSpentSum / total : 0;
    const totalOrders = customers.reduce((sum, c) => sum + c.ordersCount, 0);
    const avgOrders = total > 0 ? totalOrders / total : 0;
    const repeatBuyersCount = customers.filter((c) => c.ordersCount >= 2).length;
    const repeatPurchaseRate = total > 0 ? Math.round((repeatBuyersCount / total) * 100) : 0;

    return {
      total,
      totalSpentSum,
      avgSpent,
      avgOrders,
      repeatPurchaseRate,
    };
  }, [customers]);

  // Chart Data 1: Customer Growth (simulated signup timeline based on joined dates)
  const GROWTH_DATA = [
    { week: "Wk 24", newCustomers: 12, cumulative: 45 },
    { week: "Wk 25", newCustomers: 15, cumulative: 60 },
    { week: "Wk 26", newCustomers: 18, cumulative: 78 },
    { week: "Wk 27", newCustomers: 22, cumulative: 100 },
    { week: "Wk 28", newCustomers: 25, cumulative: 125 },
    { week: "Wk 29", newCustomers: 30, cumulative: 155 },
  ];

  // Chart Data 2: Loyalty Tier Distribution
  const tierDistributionData = useMemo(() => {
    const counts = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0, VIP: 0 };
    customers.forEach((c) => {
      counts[c.loyaltyTier] = (counts[c.loyaltyTier] || 0) + 1;
    });

    return [
      { name: "Bronze Tier", value: counts.Bronze, fill: "#D1D5DB" }, // Grey
      { name: "Silver Tier", value: counts.Silver, fill: "#94A3B8" }, // Slate
      { name: "Gold Tier", value: counts.Gold, fill: "#F59E0B" }, // Amber
      { name: "Platinum Tier", value: counts.Platinum, fill: "#06B6D4" }, // Cyan
      { name: "VIP Elite", value: counts.VIP, fill: "#0E4825" }, // Primary Green
    ];
  }, [customers]);

  // Chart Data 3: Geographic Distribution
  const cityDistributionData = useMemo(() => {
    const counts: Record<string, { customers: number; revenue: number }> = {};
    customers.forEach((c) => {
      if (!counts[c.city]) {
        counts[c.city] = { customers: 0, revenue: 0 };
      }
      counts[c.city].customers += 1;
      counts[c.city].revenue += c.totalSpent;
    });

    return Object.entries(counts).map(([name, stats]) => ({
      name,
      customers: stats.customers,
      revenue: Math.round(stats.revenue),
    }));
  }, [customers]);

  // Chart Data 4: Repeat purchasing curves (1, 2, 3, 4+ orders)
  const purchaseFrequencyData = useMemo(() => {
    const buckets = { "1 Order": 0, "2 Orders": 0, "3 Orders": 0, "4+ Orders": 0 };
    customers.forEach((c) => {
      if (c.ordersCount === 1) buckets["1 Order"] += 1;
      else if (c.ordersCount === 2) buckets["2 Orders"] += 1;
      else if (c.ordersCount === 3) buckets["3 Orders"] += 1;
      else if (c.ordersCount >= 4) buckets["4+ Orders"] += 1;
    });

    return [
      { frequency: "1 Checkout", customers: buckets["1 Order"], fill: "#E2E8F0" },
      { frequency: "2 Checkouts", customers: buckets["2 Orders"], fill: "#94A3B8" },
      { frequency: "3 Checkouts", customers: buckets["3 Orders"], fill: "#475569" },
      { frequency: "4+ Checkouts", customers: buckets["4+ Orders"], fill: "#0E4825" },
    ];
  }, [customers]);

  // Chart Data 5: LTV cohorts spend brackets (₹0-1K, ₹1K-3K, ₹3K-5K, ₹5K-10K, ₹10K+)
  const ltvCohortsData = useMemo(() => {
    const cohorts = { "0-1K": 0, "1K-3K": 0, "3K-5K": 0, "5K-10K": 0, "10K+": 0 };
    customers.forEach((c) => {
      const spent = c.totalSpent;
      if (spent <= 1000) cohorts["0-1K"] += 1;
      else if (spent <= 3000) cohorts["1K-3K"] += 1;
      else if (spent <= 5000) cohorts["3K-5K"] += 1;
      else if (spent <= 10000) cohorts["5K-10K"] += 1;
      else cohorts["10K+"] += 1;
    });

    return [
      { bracket: "₹0 - ₹1K", customers: cohorts["0-1K"] },
      { bracket: "₹1K - ₹3K", customers: cohorts["1K-3K"] },
      { bracket: "₹3K - ₹5K", customers: cohorts["3K-5K"] },
      { bracket: "₹5K - ₹10K", customers: cohorts["5K-10K"] },
      { bracket: "₹10K+ Spend", customers: cohorts["10K+"] },
    ];
  }, [customers]);

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Customer CRM Analytics Console"
          description="Examine cohort retention rates, customer lifetime valuation charts, geographic maps splits, and registrations growth."
          breadcrumbs={[
            { label: "Customer CRM", to: "/admin/customers" },
            { label: "CRM Analytics" },
          ]}
        />

        <div className="flex items-center gap-2 self-start md:self-center">
          <Link to="/admin/customers">
            <AdminButton variant="outline" size="sm">
              <ArrowLeft size={13} className="mr-1.5" />
              <span>Back to Directory</span>
            </AdminButton>
          </Link>
        </div>
      </div>

      {/* Stats KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Consolidated CRM Profiles"
          value={stats.total.toString()}
          icon={Users}
          trend={{ value: 12.8, label: "vs last month", isPositive: true }}
        />
        <StatCard
          title="Consolidated Customer Value"
          value={`₹${stats.totalSpentSum.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
          icon={DollarSign}
          trend={{ value: 18.4, label: "vs last month", isPositive: true }}
        />
        <StatCard
          title="CRM Repeat Purchase Rate"
          value={`${stats.repeatPurchaseRate}%`}
          icon={Percent}
          subtext="Profiles with multiple POS checkouts"
        />
        <StatCard
          title="Average Spender Valuation"
          value={`₹${stats.avgSpent.toFixed(2)}`}
          icon={Award}
          subtext={`Avg checkouts frequency: ${stats.avgOrders.toFixed(1)} / cust`}
        />
      </div>

      {/* Row 1: Growth line & Tier Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Growth Line chart */}
        <div className="lg:col-span-7">
          <AdminCard
            title="Consolidated Customer Base Accumulation"
            subtitle="Cumulative customer acquisition curve mapped by weekly cohorts"
          >
            <div className="h-80 w-full font-sans text-xs pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={GROWTH_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0E4825" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0E4825" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                  <XAxis dataKey="week" stroke="#A3A3A3" fontSize={11} tickLine={false} />
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
                    dataKey="cumulative"
                    name="Cumulative Profiles"
                    stroke="#0E4825"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorGrowth)"
                  />
                  <Legend verticalAlign="top" height={36} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </AdminCard>
        </div>

        {/* Tier Distribution Pie */}
        <div className="lg:col-span-5">
          <AdminCard
            title="Customer Loyalty Tier Distribution"
            subtitle="Proportions of customer base holding Silver/Gold/VIP elite status"
          >
            <div className="h-80 w-full font-sans text-xs flex flex-col items-center justify-center pt-2">
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tierDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      nameKey="name"
                    >
                      {tierDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #EAEAEA",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legends */}
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pb-4">
                {tierDistributionData.map((tier) => (
                  <div
                    key={tier.name}
                    className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: tier.fill }}
                    />
                    <span>
                      {tier.name} ({tier.value})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </AdminCard>
        </div>
      </div>

      {/* Row 2: Repeat Buying frequency bar & LTV cohort curve bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Repeat buying frequency */}
        <AdminCard
          title="Customer Retention & Repeat Buying Curves"
          subtitle="Breakdown of customer counts based on cumulative repeat orders"
        >
          <div className="h-80 w-full font-sans text-xs pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={purchaseFrequencyData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                <XAxis dataKey="frequency" stroke="#A3A3A3" fontSize={11} tickLine={false} />
                <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "1px solid #EAEAEA",
                  }}
                />
                <Bar dataKey="customers" name="Customers" radius={[8, 8, 0, 0]}>
                  {purchaseFrequencyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
                <Legend verticalAlign="top" height={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>

        {/* LTV Spend curves */}
        <AdminCard
          title="Customer Lifetime Value (LTV) Distribution"
          subtitle="Volume of customers bucketed across gross lifetime spend milestones"
        >
          <div className="h-80 w-full font-sans text-xs pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ltvCohortsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                <XAxis dataKey="bracket" stroke="#A3A3A3" fontSize={11} tickLine={false} />
                <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "1px solid #EAEAEA",
                  }}
                />
                <Bar
                  dataKey="customers"
                  name="Customer count"
                  fill="#FF6600"
                  radius={[8, 8, 0, 0]}
                />
                <Legend verticalAlign="top" height={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>
      </div>

      {/* Row 3: City geographic distribution */}
      <AdminCard
        title="CRM Customer Density by Location Cities"
        subtitle="Gross profiles and accumulated sales revenue distribution mapped across cities"
      >
        <div className="h-80 w-full font-sans text-xs pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={cityDistributionData}
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
              <Bar
                dataKey="customers"
                name="Customer profiles"
                fill="#0E4825"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="revenue"
                name="Settled Sales Revenue (₹)"
                fill="#F59E0B"
                radius={[6, 6, 0, 0]}
              />
              <Legend verticalAlign="top" height={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </AdminCard>
    </div>
  );
};

export default AdminCustomerAnalyticsPage;
