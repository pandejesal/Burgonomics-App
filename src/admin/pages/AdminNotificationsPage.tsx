import React, { useState } from "react";
import { Bell, Send, CheckCircle, Users, Activity, Sparkles, Megaphone } from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { Timeline, ActivityItem } from "../components/Utilities";

interface PushLog {
  id: string;
  title: string;
  body: string;
  target: string;
  sentAt: string;
  successCount: number;
}

const INITIAL_PUSH_LOGS: PushLog[] = [
  {
    id: "push_1",
    title: "🍔 Buy 1 Get 1 FREE is Back!",
    body: "Sink your teeth into our legendary Double Veg Supreme. Today only across all outlets!",
    target: "All Registered Customers",
    sentAt: "2026-07-19 12:00",
    successCount: 1420,
  },
  {
    id: "push_2",
    title: "⚡ Weekend Feast Fries Alert!",
    body: "Get a free Peri Peri Fry on checkouts exceeding ₹350. Apply code FREEPERIPERI.",
    target: "Koramangala Bangalore users",
    sentAt: "2026-07-18 17:30",
    successCount: 410,
  },
];

export const AdminNotificationsPage: React.FC = () => {
  const [logs, setLogs] = useState<PushLog[]>(INITIAL_PUSH_LOGS);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("all");
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  const handleDispatchPush = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setIsSending(true);
    setSendSuccess(false);

    setTimeout(() => {
      const newLog: PushLog = {
        id: `push_${Date.now()}`,
        title,
        body,
        target: target === "all" ? "All Registered Customers" : "High Frequency Buyers",
        sentAt: new Date().toISOString().replace("T", " ").substring(0, 16),
        successCount: target === "all" ? 1850 : 290,
      };

      setLogs([newLog, ...logs]);
      setIsSending(false);
      setSendSuccess(true);
      setTitle("");
      setBody("");
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Firebase Push Notification Core"
        description="Craft, design, and dispatch high-relevance push notifications targeting specific user cohorts."
        breadcrumbs={[{ label: "Notifications" }]}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Total Tokens Synced"
          value="1,850 devices"
          icon={Users}
          subtext="Firebase Cloud Messaging"
        />
        <StatCard title="Avg Delivery Rate" value="98.4%" icon={CheckCircle} />
        <StatCard title="Campaigns Dispatched" value={logs.length} icon={Megaphone} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Creator panel */}
        <AdminCard
          title="Create FCM Campaign"
          subtitle="Transmit real-time banners directly to customer locked phones"
        >
          <form onSubmit={handleDispatchPush} className="space-y-4 font-sans">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Target Cohort Segment
              </label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
              >
                <option value="all">All Registrations (1,850 device targets)</option>
                <option value="high-buyers">Loyal VIP Cohorts (290 targets)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Campaign Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., 🍔 BOGO Burger Madness is Live!"
                className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Campaign Body Message
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="e.g., Sink your teeth into double-cheese burgers. Use code BOGO at checkout!"
                rows={3}
                className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                required
              />
            </div>

            {sendSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle size={15} />
                <span>Success: Campaign dispatched and FCM tokens resolved successfully!</span>
              </div>
            )}

            <AdminButton type="submit" variant="secondary" isLoading={isSending} className="w-full">
              <Send size={14} />
              <span>Broadcast Campaign Banner</span>
            </AdminButton>
          </form>
        </AdminCard>

        {/* Dispatch Logs timeline */}
        <AdminCard
          title="Historic Dispatch Log"
          subtitle="Review performance and conversion logs of previous notifications"
        >
          <Timeline>
            {logs.map((log) => (
              <ActivityItem
                key={log.id}
                title={log.title}
                description={`${log.body} \nTarget: ${log.target} · ${log.successCount} deliveries.`}
                time={log.sentAt}
                variant="success"
                icon={Bell}
              />
            ))}
          </Timeline>
        </AdminCard>
      </div>
    </div>
  );
};
