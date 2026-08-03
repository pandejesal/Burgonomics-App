import React, { useEffect, useState } from "react";
import {
  Layers,
  Plus,
  Play,
  Pause,
  Trash2,
  Clock,
  Settings,
  GitCommit,
  GitPullRequest,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowDown,
  Sparkles,
  RefreshCw,
  Send,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { ConfirmDialog } from "../components/Utilities";
import { StatusBadge } from "../components/Badges";
import { marketingStorage, MarketingAutomation, AutomationNode } from "./marketingData";

export const AdminAutomationPage: React.FC = () => {
  const [automations, setAutomations] = useState<MarketingAutomation[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<MarketingAutomation | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form states
  const [flowName, setFlowName] = useState("");
  const [flowDesc, setFlowDesc] = useState("");
  const [triggerType, setTriggerType] = useState<any>("Registration");

  useEffect(() => {
    const flows = marketingStorage.getAutomations();
    setAutomations(flows);
    if (flows.length > 0) {
      setSelectedFlow(flows[0]);
    }

    const sub = marketingStorage.subscribe(() => {
      const updated = marketingStorage.getAutomations();
      setAutomations(updated);
      if (selectedFlow) {
        const stillExists = updated.find((a) => a.id === selectedFlow.id);
        if (!stillExists && updated.length > 0) setSelectedFlow(updated[0]);
      }
    });
    return () => {
      sub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleStatus = (id: string) => {
    const flow = automations.find((a) => a.id === id);
    if (flow) {
      const nextStatus = flow.status === "Active" ? "Inactive" : "Active";
      marketingStorage.updateAutomationStatus(id, nextStatus);
    }
  };

  const handleDeleteFlow = (id: string) => {
    marketingStorage.deleteAutomation(id);
    setConfirmDeleteId(null);
  };

  const handleCreateFlow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flowName) return;

    // Build standard nodes depending on trigger
    const standardNodes: AutomationNode[] = [
      {
        id: "node-1",
        type: "trigger",
        label: `${triggerType} Trigger`,
        config: { trigger: triggerType },
      },
      {
        id: "node-2",
        type: "action",
        label: "Send Automated Push Alert",
        config: { channel: "Push" },
      },
      { id: "node-3", type: "wait", label: "Wait 2 Days", config: { duration: 2, unit: "days" } },
      { id: "node-4", type: "condition", label: "Verification Check", config: {} },
    ];

    marketingStorage.createAutomation({
      name: flowName,
      description: flowDesc || `Automated customer flow triggered by ${triggerType}`,
      triggerType,
      status: "Active",
      nodes: standardNodes,
      edges: [
        { id: "e-1", from: "node-1", to: "node-2" },
        { id: "e-2", from: "node-2", to: "node-3" },
        { id: "e-3", from: "node-3", to: "node-4" },
      ],
    });

    setFlowName("");
    setFlowDesc("");
    setTriggerType("Registration");
    setShowCreateModal(false);
  };

  const handleSimulateTrigger = (id: string) => {
    marketingStorage.simulateAutomationTrigger(id);
  };

  const activeCount = automations.filter((a) => a.status === "Active").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing Journey Automations"
        description="Design smart, event-triggered customer communication pipelines (Welcome flows, inactive win-backs, post-order reviews)."
        breadcrumbs={[{ label: "Marketing Hub", to: "/admin/marketing" }, { label: "Automations" }]}
        actions={
          <AdminButton variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} />
            <span>Create Journey Flow</span>
          </AdminButton>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Journey Flows" value={automations.length} icon={Layers} />
        <StatCard
          title="Active Journeys"
          value={`${activeCount} / ${automations.length}`}
          icon={Play}
        />
        <AdminCard className="flex items-center justify-between">
          <div>
            <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest">
              Journey Conversion Rate
            </span>
            <span className="block text-2xl font-black text-[#FF6600] mt-1 font-mono">34.2%</span>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Weighted conversion from initial triggers.
            </p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-[#FF6600]">
            <Sparkles size={20} />
          </span>
        </AdminCard>
      </div>

      {/* Main split grid: flows on left, interactive flow chart on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Ledger of automated workflows */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-sm font-black text-gray-800 dark:text-gray-200 uppercase tracking-wider font-mono">
            Journey Flow Ledger
          </h3>

          <div className="space-y-4 max-h-[560px] overflow-y-auto pr-2">
            {automations.map((flow) => {
              const isActiveFlow = selectedFlow?.id === flow.id;
              return (
                <div
                  key={flow.id}
                  onClick={() => setSelectedFlow(flow)}
                  className={`rounded-2xl border p-4 text-left cursor-pointer transition-all space-y-3 relative group ${
                    isActiveFlow
                      ? "border-[#0E4825] bg-[#0E4825]/5 dark:border-emerald-500 dark:bg-emerald-950/15 shadow-sm"
                      : "border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 bg-white dark:bg-[#1A1A1A]"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-[#FF6600]/10 text-[#FF6600] text-[9px] font-black uppercase tracking-wider font-mono">
                          Trigger: {flow.triggerType}
                        </span>
                        <StatusBadge
                          status={flow.status === "Active" ? "active" : "inactive"}
                          label={flow.status}
                        />
                      </div>
                      <h4 className="font-extrabold text-sm text-gray-900 dark:text-white mt-1">
                        {flow.name}
                      </h4>
                      <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                        {flow.description}
                      </p>
                    </div>
                  </div>

                  {/* Flow statistics */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono pt-3 border-t border-gray-100 dark:border-gray-800/40">
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                        Triggers
                      </span>
                      <span className="font-bold text-gray-800 dark:text-gray-200">
                        {flow.stats.triggered}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                        Done
                      </span>
                      <span className="font-bold text-emerald-600">{flow.stats.completed}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                        Sales
                      </span>
                      <span className="font-bold text-[#FF6600]">{flow.stats.conversions}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleStatus(flow.id);
                        }}
                        className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer ${
                          flow.status === "Active" ? "text-[#FF6600]" : "text-[#0E4825]"
                        }`}
                      >
                        {flow.status === "Active" ? <Pause size={12} /> : <Play size={12} />}
                        <span>{flow.status === "Active" ? "Pause" : "Resume"}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(flow.id);
                      }}
                      className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title="Delete Journey Flow"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column: Interactive flowchart node graph rendering */}
        <div className="lg:col-span-2">
          {selectedFlow ? (
            <AdminCard
              title={`Visual Canvas: ${selectedFlow.name}`}
              subtitle="Sequence of event triggers, queue delay parameters, and dispatch filters"
              extra={
                <AdminButton
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSimulateTrigger(selectedFlow.id)}
                  disabled={selectedFlow.status !== "Active"}
                  className="bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#FF6600]"
                >
                  <Send size={12} />
                  <span>Simulate Real Trigger</span>
                </AdminButton>
              }
            >
              {/* Interactive Visual Node Timeline graph representation */}
              <div className="p-6 bg-gray-50/50 dark:bg-[#121212]/50 border border-gray-100 dark:border-gray-800 rounded-3xl flex flex-col items-center space-y-4 relative min-h-[440px] justify-center">
                {selectedFlow.nodes.map((node, index) => {
                  const isTrigger = node.type === "trigger";
                  const isAction = node.type === "action";
                  const isWait = node.type === "wait";
                  const isCondition = node.type === "condition";

                  return (
                    <React.Fragment key={node.id}>
                      {/* Connection Line Arrow */}
                      {index > 0 && (
                        <div className="flex flex-col items-center">
                          <ArrowDown size={18} className="text-[#0E4825] animate-pulse" />
                        </div>
                      )}

                      {/* Visually stunning custom node layout */}
                      <div
                        className={`w-full max-w-sm rounded-2xl border p-4 shadow-sm bg-white dark:bg-[#1A1A1A] transition-all relative overflow-hidden ${
                          isTrigger
                            ? "border-orange-200 bg-orange-50/5 dark:border-orange-950/30"
                            : isAction
                              ? "border-[#0E4825]/30 bg-[#0E4825]/5 dark:border-emerald-950/20"
                              : isWait
                                ? "border-amber-200 bg-amber-50/5 dark:border-amber-950/30"
                                : "border-blue-200 bg-blue-50/5 dark:border-blue-950/30"
                        }`}
                      >
                        {/* Decorative side accent tag */}
                        <div
                          className={`absolute top-0 bottom-0 left-0 w-2 ${
                            isTrigger
                              ? "bg-[#FF6600]"
                              : isAction
                                ? "bg-[#0E4825]"
                                : isWait
                                  ? "bg-amber-500"
                                  : "bg-blue-500"
                          }`}
                        />

                        <div className="pl-3 flex items-center justify-between gap-4">
                          <div className="space-y-0.5">
                            <span className="block text-[8px] font-black uppercase tracking-widest text-gray-400 font-mono">
                              {node.type.toUpperCase() === "TRIGGER"
                                ? "🚀 ENTRY TRIGGER"
                                : node.type.toUpperCase() === "ACTION"
                                  ? "💬 DISPATCH ACTION"
                                  : node.type.toUpperCase() === "WAIT"
                                    ? "⏳ TIMEOUT DELAY"
                                    : "⚖️ ROUTING DECISION"}
                            </span>
                            <h5 className="font-bold text-sm text-gray-900 dark:text-white">
                              {node.label}
                            </h5>
                            {isWait && (
                              <p className="text-[10px] text-gray-400">
                                Pause subscriber state execution in background redis worker queue
                              </p>
                            )}
                          </div>

                          <span
                            className={`p-1.5 rounded-xl shrink-0 ${
                              isTrigger
                                ? "bg-orange-50 text-[#FF6600] dark:bg-orange-950/30"
                                : isAction
                                  ? "bg-green-50 text-[#0E4825] dark:bg-emerald-950/30"
                                  : isWait
                                    ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30"
                                    : "bg-blue-50 text-blue-600 dark:bg-blue-950/30"
                            }`}
                          >
                            {isTrigger && <GitCommit size={14} />}
                            {isAction && <GitPullRequest size={14} />}
                            {isWait && <Clock size={14} />}
                            {isCondition && <CheckCircle2 size={14} />}
                          </span>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </AdminCard>
          ) : (
            <div className="h-64 border border-dashed border-gray-200 rounded-3xl flex items-center justify-center text-xs text-gray-400 bg-white">
              Select an automation workflow from the ledger to render its visual interactive flow
              canvas.
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {confirmDeleteId && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={() => handleDeleteFlow(confirmDeleteId)}
          title="Permanently Delete Journey Flow?"
          description="Are you sure you want to delete this journey automation flow? All queue tasks, background threads, and simulated statistics will be permanently scrubbed."
          confirmLabel="Delete Flow"
        />
      )}

      {/* Create Flow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]">
          <AdminCard
            title="Create Custom Journey Flow"
            subtitle="Setup automated, event-triggered communication sequences for your customers"
            className="w-full max-w-lg shadow-2xl border border-gray-150 animate-scaleIn"
          >
            <form onSubmit={handleCreateFlow} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase block">
                  Journey Flow Label
                </label>
                <input
                  type="text"
                  required
                  value={flowName}
                  onChange={(e) => setFlowName(e.target.value)}
                  placeholder="e.g. Inactive Winback series"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-2 text-sm focus:outline-none dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase block">
                  Short Objective Description
                </label>
                <textarea
                  value={flowDesc}
                  onChange={(e) => setFlowDesc(e.target.value)}
                  placeholder="Explain what this automation does..."
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-2 text-sm focus:outline-none dark:text-white h-20 resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase block">
                  Trigger Triggering Hook Event
                </label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as any)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-3 py-2 text-sm focus:outline-none dark:text-white"
                >
                  <option value="Registration">Customer Registration</option>
                  <option value="Birthday">Birthday Milestone</option>
                  <option value="Anniversary">Anniversary Milestone</option>
                  <option value="Order Completed">Order Completed (Any)</option>
                  <option value="First Order">First Order Completed</option>
                  <option value="No Orders">No Orders (Inactivity days threshold)</option>
                  <option value="Coupon Expiring">Assigned Coupon Expiring</option>
                  <option value="Points Expiring">Loyalty Points Expiring</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
                <AdminButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </AdminButton>
                <AdminButton type="submit" variant="primary" size="sm">
                  Launch Visual Builder
                </AdminButton>
              </div>
            </form>
          </AdminCard>
        </div>
      )}
    </div>
  );
};
