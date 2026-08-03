import React, { useEffect, useState } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Mail,
  Bell,
  MessageSquare,
  Phone,
  Sparkles,
  Eye,
  Info,
  Layers,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { ConfirmDialog } from "../components/Utilities";
import { marketingStorage, MarketingTemplate } from "./marketingData";

export const AdminTemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<MarketingTemplate | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Variable replacement states for live phone mockup preview
  const [replacements, setReplacements] = useState<Record<string, string>>({
    customer_name: "Arjun Kapoor",
    store_name: "Burgonomics Navrangpura",
    coupon_code: "DAMNGOOD50",
    city: "Ahmedabad",
    points: "850",
  });

  // Form states
  const [name, setName] = useState("");
  const [category, setCategory] = useState<any>("Promotions");
  const [channels, setChannels] = useState<string[]>(["Push"]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    const tmps = marketingStorage.getTemplates();
    setTemplates(tmps);
    if (tmps.length > 0) {
      setSelectedTemplate(tmps[0]);
    }

    const sub = marketingStorage.subscribe(() => {
      const updated = marketingStorage.getTemplates();
      setTemplates(updated);
      if (selectedTemplate) {
        const stillExists = updated.find((t) => t.id === selectedTemplate.id);
        if (!stillExists && updated.length > 0) setSelectedTemplate(updated[0]);
      }
    });
    return () => {
      sub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !title || !body) return;

    // Detect variables automatically, e.g. anything inside {{...}}
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const detectedVars: string[] = [];
    let match;
    while ((match = variableRegex.exec(body)) !== null) {
      detectedVars.push(match[1].trim());
    }

    const newTmp = marketingStorage.createTemplate({
      name,
      category,
      channels: channels as any,
      title,
      body,
      imageUrl: imageUrl || undefined,
      variables: [...new Set(detectedVars)],
    });

    setName("");
    setTitle("");
    setBody("");
    setImageUrl("");
    setChannels(["Push"]);
    setShowCreateModal(false);
    if (newTmp) setSelectedTemplate(newTmp);
  };

  const handleDeleteTemplate = (id: string) => {
    marketingStorage.deleteTemplate(id);
    setConfirmDeleteId(null);
  };

  const toggleFormChannel = (ch: string) => {
    setChannels((prev) => (prev.includes(ch) ? prev.filter((item) => item !== ch) : [...prev, ch]));
  };

  // Replace body text variables with mock input fields
  const renderMockBody = () => {
    if (!selectedTemplate) return "";
    let resultText = selectedTemplate.body;
    Object.keys(replacements).forEach((key) => {
      const placeholder = `{{${key}}}`;
      resultText = resultText.replaceAll(placeholder, replacements[key] || placeholder);
    });
    return resultText;
  };

  // Replace title variables
  const renderMockTitle = () => {
    if (!selectedTemplate) return "";
    let resultText = selectedTemplate.title;
    Object.keys(replacements).forEach((key) => {
      const placeholder = `{{${key}}}`;
      resultText = resultText.replaceAll(placeholder, replacements[key] || placeholder);
    });
    return resultText;
  };

  const handleVariableChange = (varName: string, val: string) => {
    setReplacements((prev) => ({ ...prev, [varName]: val }));
  };

  // Categories list
  const categories = [
    "All",
    "Promotions",
    "Birthday",
    "Order Follow-up",
    "Festival",
    "Offers",
    "New Store",
    "Coupons",
    "Loyalty",
    "Feedback",
    "Referral",
  ];

  const filteredTemplates = templates.filter((t) => {
    if (activeCategory === "All") return true;
    return t.category === activeCategory;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset & Message Templates"
        description="Design reusable message structures for SMS, Push notifications, WhatsApp, and Emails, complete with dynamic localized variables."
        breadcrumbs={[{ label: "Marketing Hub", to: "/admin/marketing" }, { label: "Templates" }]}
        actions={
          <AdminButton variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} />
            <span>Create Message Template</span>
          </AdminButton>
        }
      />

      {/* Split layout: left ledger, right interactive preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Category picker & List ledger */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex border-b border-gray-100 dark:border-gray-800 overflow-x-auto pb-1 gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                  activeCategory === cat
                    ? "border-[#0E4825] text-[#0E4825] dark:border-emerald-500 dark:text-emerald-400 font-extrabold"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2">
            {filteredTemplates.map((tmp) => {
              const isActive = selectedTemplate?.id === tmp.id;
              return (
                <div
                  key={tmp.id}
                  onClick={() => setSelectedTemplate(tmp)}
                  className={`rounded-2xl border p-4 text-left cursor-pointer transition-all space-y-3 relative group ${
                    isActive
                      ? "border-[#0E4825] bg-[#0E4825]/5 dark:border-emerald-500 dark:bg-emerald-950/15 shadow-sm"
                      : "border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 bg-white dark:bg-[#1A1A1A]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <span className="inline-block px-2 py-0.5 rounded bg-gray-50 dark:bg-gray-900 text-[9px] font-black uppercase tracking-widest text-gray-400 font-mono">
                        {tmp.category}
                      </span>
                      <h4 className="font-extrabold text-sm text-gray-900 dark:text-white mt-1 line-clamp-1">
                        {tmp.name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1">
                      {tmp.channels.map((chan) => (
                        <span key={chan} className="text-gray-400" title={chan}>
                          {chan === "Push" && <Bell size={12} className="text-emerald-600" />}
                          {chan === "SMS" && (
                            <MessageSquare size={12} className="text-orange-600" />
                          )}
                          {chan === "WhatsApp" && <Phone size={12} className="text-green-600" />}
                          {chan === "Email" && <Mail size={12} className="text-blue-600" />}
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{tmp.body}</p>

                  <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider font-mono pt-2 border-t border-gray-100 dark:border-gray-800/40">
                    <span className="flex items-center gap-1">
                      <FileText size={10} />
                      Vars: {tmp.variables.length > 0 ? tmp.variables.join(", ") : "None"}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(tmp.id);
                      }}
                      className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title="Delete Template"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Interactive Mock Previews & Replacements */}
        <div className="lg:col-span-1 space-y-6">
          {selectedTemplate ? (
            <AdminCard
              title="Template Live Sandbox"
              subtitle="Inject variable text and preview across phone shells"
            >
              {/* Dynamic replacement input fields */}
              {selectedTemplate.variables.length > 0 ? (
                <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl">
                  <h5 className="text-[10px] font-black text-gray-500 uppercase tracking-wider font-mono">
                    Inject Mock Values (Template variables)
                  </h5>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    {selectedTemplate.variables.map((v) => (
                      <div key={v} className="flex items-center gap-2">
                        <span className="font-mono text-gray-400 w-24 shrink-0 truncate">
                          {"{{"}
                          {v}
                          {"}}"}:
                        </span>
                        <input
                          type="text"
                          value={replacements[v] || ""}
                          onChange={(e) => handleVariableChange(v, e.target.value)}
                          placeholder={`Value for {{${v}}}`}
                          className="flex-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-2 py-1 text-xs dark:text-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl flex items-center gap-2 text-xs text-gray-400">
                  <Info size={12} />
                  <span>No variables detected in this static template template.</span>
                </div>
              )}

              {/* Phone Mockup rendering */}
              <div className="mt-6 flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 font-mono">
                  Active Channel Mock (iPhone 14)
                </span>

                {/* Phone shell container */}
                <div className="relative w-[240px] h-[440px] rounded-[32px] border-[10px] border-gray-900 dark:border-gray-800 bg-gray-100 dark:bg-[#121212] overflow-hidden shadow-2xl flex flex-col">
                  {/* Phone ear-speaker Notch */}
                  <div className="absolute top-0 inset-x-0 h-3.5 bg-gray-900 dark:bg-gray-800 flex items-center justify-center z-30">
                    <div className="w-12 h-1.5 rounded-full bg-black" />
                  </div>

                  {/* Screen Content */}
                  <div
                    className="flex-1 p-3 pt-6 flex flex-col justify-start relative z-10 bg-cover bg-center overflow-y-auto"
                    style={{
                      backgroundImage: `url('https://images.unsplash.com/photo-1548345680-f5475ea5df84?w=240&auto=format&fit=crop&q=40')`,
                    }}
                  >
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] z-0" />

                    <div className="relative z-10 space-y-4">
                      {/* Lock screen Clock */}
                      <div className="text-center text-white space-y-0.5 py-2">
                        <span className="block text-2xl font-light tracking-tight font-sans">
                          08:42
                        </span>
                        <span className="block text-[8px] font-bold uppercase tracking-widest text-gray-200">
                          Sunday, July 19
                        </span>
                      </div>

                      {/* Render preview card according to channels */}
                      {selectedTemplate.channels.slice(0, 1).map((chan) => {
                        const titleText = renderMockTitle();
                        const bodyText = renderMockBody();
                        const hasImage = selectedTemplate.imageUrl;

                        if (chan === "Push") {
                          return (
                            <div
                              key={chan}
                              className="rounded-xl bg-white/90 dark:bg-[#1A1A1A]/95 p-3 shadow-lg border border-white/25 dark:border-gray-800/10 backdrop-blur-md text-gray-900 dark:text-white"
                            >
                              <div className="flex items-center gap-1.5 mb-1 text-[8px] font-black uppercase tracking-widest text-gray-400">
                                <div className="flex h-3 w-3 items-center justify-center rounded bg-[#0E4825] text-white font-extrabold text-[6px]">
                                  B
                                </div>
                                <span className="font-mono">BURGONOMICS</span>
                                <span className="ml-auto">now</span>
                              </div>
                              <h6 className="font-extrabold text-[11px]">{titleText}</h6>
                              <p className="text-[9px] text-gray-500 mt-0.5 leading-relaxed">
                                {bodyText}
                              </p>
                              {hasImage && (
                                <img
                                  src={selectedTemplate.imageUrl}
                                  className="mt-2 rounded-lg h-20 w-full object-cover border border-gray-100"
                                />
                              )}
                            </div>
                          );
                        }

                        if (chan === "WhatsApp") {
                          return (
                            <div
                              key={chan}
                              className="rounded-xl bg-[#DCF8C6]/95 p-3 shadow-lg border border-green-200/50 backdrop-blur-md text-gray-900"
                            >
                              <div className="flex items-center gap-1.5 mb-1 text-[7px] font-black uppercase tracking-widest text-green-700">
                                <Phone size={8} />
                                <span>BURGONOMICS SUPPORT</span>
                                <span className="ml-auto text-[6px] text-green-600">08:42 AM</span>
                              </div>
                              {hasImage && (
                                <img
                                  src={selectedTemplate.imageUrl}
                                  className="mb-2 rounded-lg h-20 w-full object-cover"
                                />
                              )}
                              <p className="text-[9px] leading-relaxed font-sans">{bodyText}</p>
                            </div>
                          );
                        }

                        if (chan === "SMS") {
                          return (
                            <div
                              key={chan}
                              className="rounded-xl bg-gray-200/90 dark:bg-gray-900/95 p-3 shadow-lg backdrop-blur-md text-gray-900 dark:text-white"
                            >
                              <div className="flex items-center gap-1.5 mb-1 text-[7px] font-black uppercase tracking-widest text-gray-400">
                                <MessageSquare size={8} />
                                <span>VZ-BURGMC</span>
                                <span className="ml-auto">now</span>
                              </div>
                              <p className="text-[9px] leading-relaxed font-mono">{bodyText}</p>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  </div>

                  {/* Home Indicator swipe-bar */}
                  <div className="absolute bottom-1 inset-x-0 h-1 flex items-center justify-center z-20">
                    <div className="w-16 h-0.5 rounded-full bg-black dark:bg-gray-700" />
                  </div>
                </div>
              </div>
            </AdminCard>
          ) : (
            <div className="h-48 border border-dashed border-gray-200 rounded-3xl flex items-center justify-center text-xs text-gray-400">
              Select a template to view interactive sandbox preview.
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {confirmDeleteId && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={() => handleDeleteTemplate(confirmDeleteId)}
          title="Delete Message Template?"
          description="Confirm purging this template asset. Any active campaign wizards or automated visual flow builders referencing this ID will throw fallbacks."
          confirmLabel="Purge Template"
        />
      )}

      {/* Create Template Dialog */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]">
          <AdminCard
            title="Design New Message Template"
            subtitle="Configure reusable subjects and bodies using handlebars dynamic variables"
            className="w-full max-w-lg shadow-2xl border border-gray-150 animate-scaleIn"
          >
            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase block">
                  Template Label Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Inactive 60d Winback discount"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-2 text-sm focus:outline-none dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase block">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-3 py-2 text-sm focus:outline-none dark:text-white"
                  >
                    <option value="Promotions">Promotions</option>
                    <option value="Birthday">Birthday</option>
                    <option value="Order Follow-up">Order Follow-up</option>
                    <option value="Festival">Festival Offer</option>
                    <option value="Offers">General Offer</option>
                    <option value="New Store">New Store Opening</option>
                    <option value="Coupons">Voucher / Coupons</option>
                    <option value="Loyalty">Loyalty Rewards</option>
                    <option value="Feedback">Feedback Survey</option>
                    <option value="Referral">Referral Hook</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase block">
                    Promo Image URL (Optional)
                  </label>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-2 text-sm focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase block">
                  Default Title / Subject Line
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Welcome to BURGONOMICS, {{customer_name}}! 🎂🍔"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-2 text-sm focus:outline-none dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase block">
                  Message Body Text
                </label>
                <textarea
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi {{customer_name}}, make your day damn good! We have loaded bonus points into your wallet at {{store_name}}. Code: {{coupon_code}}..."
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-3 py-2 text-sm focus:outline-none dark:text-white h-24 resize-none"
                />
                <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">
                  Variables detected automatically. Wrap fields in double curly brackets, e.g.,{" "}
                  <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
                    {"{{customer_name}}"}
                  </code>
                  ,{" "}
                  <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
                    {"{{store_name}}"}
                  </code>
                  , etc.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase block">
                  Target Channels (Multi-Select)
                </label>
                <div className="flex gap-2">
                  {["Push", "SMS", "WhatsApp", "Email"].map((ch) => {
                    const isSel = channels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => toggleFormChannel(ch)}
                        className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${
                          isSel
                            ? "border-[#0E4825] bg-[#0E4825]/5 text-[#0E4825] dark:border-emerald-500 dark:text-emerald-400"
                            : "border-gray-100 dark:border-gray-800 text-gray-400"
                        }`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
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
                  Save Template
                </AdminButton>
              </div>
            </form>
          </AdminCard>
        </div>
      )}
    </div>
  );
};
