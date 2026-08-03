import React, { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Megaphone,
  Users,
  MessageSquare,
  Sparkles,
  Calendar,
  Layers,
  Phone,
  Mail,
  Bell,
  Eye,
  Gift,
  HelpCircle,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { customerStorage, SavedSegment, CustomerProfile } from "./customersData";
import { marketingStorage } from "./marketingData";

export const AdminCreateCampaignPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [segments, setSegments] = useState<SavedSegment[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);

  // Wizard state fields
  const [campaignName, setCampaignName] = useState("");
  const [campaignDesc, setCampaignDesc] = useState("");
  const [objective, setObjective] = useState<any>("Sales Conversion");
  const [channels, setChannels] = useState<string[]>(["Push"]);

  const [audienceType, setAudienceType] = useState<any>("Entire Base");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [selectedCity, setSelectedCity] = useState("Ahmedabad");
  const [selectedStore, setSelectedStore] = useState("Burgonomics Navrangpura");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);

  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgImage, setMsgImage] = useState("");
  const [deepLink, setDeepLink] = useState("burgonomics://menu");
  const [couponCode, setCouponCode] = useState("");

  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [scheduledDateTime, setScheduledDateTime] = useState("");
  const [abTestingEnabled, setAbTestingEnabled] = useState(false);
  const [abSubjectA, setAbSubjectA] = useState("");
  const [abSubjectB, setAbSubjectB] = useState("");
  const [abSplitPercent, setAbSplitPercent] = useState(20);

  useEffect(() => {
    setSegments(customerStorage.getSegments());
    setCustomers(customerStorage.getCustomers());
  }, []);

  const toggleChannel = (chan: string) => {
    setChannels((prev) => (prev.includes(chan) ? prev.filter((c) => c !== chan) : [...prev, chan]));
  };

  const toggleCustomerSelection = (id: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const validateStep = () => {
    if (step === 1) {
      return campaignName.trim().length > 0 && channels.length > 0;
    }
    if (step === 2) {
      if (audienceType === "Custom Segment") return selectedSegmentId.length > 0;
      if (audienceType === "Manual Selection") return selectedCustomerIds.length > 0;
      return true;
    }
    if (step === 3) {
      return msgTitle.trim().length > 0 && msgBody.trim().length > 0;
    }
    if (step === 4) {
      if (scheduleType === "later") return scheduledDateTime.length > 0;
      if (abTestingEnabled) return abSubjectA.trim().length > 0 && abSubjectB.trim().length > 0;
      return true;
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    setStep((prev) => prev - 1);
  };

  const handleLaunch = () => {
    let audienceVal = "";
    if (audienceType === "Custom Segment") {
      const seg = segments.find((s) => s.id === selectedSegmentId);
      audienceVal = seg ? seg.name : "";
    } else if (audienceType === "City Specific") {
      audienceVal = selectedCity;
    } else if (audienceType === "Store Specific") {
      audienceVal = selectedStore;
    } else if (audienceType === "Manual Selection") {
      audienceVal = `${selectedCustomerIds.length} profiles`;
    }

    const payload: any = {
      name: campaignName,
      description: campaignDesc || `Campaign pushing ${msgTitle}`,
      objective,
      channels: channels as any,
      status: scheduleType === "now" ? "Active" : "Scheduled",
      audienceType,
      audienceFilterValue: audienceVal,
      messageTitle: msgTitle,
      messageBody: msgBody,
      messageImage: msgImage || undefined,
      deepLink: deepLink || undefined,
      couponCode: couponCode || undefined,
      scheduledTime: scheduleType === "later" ? scheduledDateTime : undefined,
      abTesting: abTestingEnabled
        ? {
            enabled: true,
            subjectA: abSubjectA,
            subjectB: abSubjectB,
            splitPercent: abSplitPercent,
            metricsA: { sent: 0, opened: 0, revenue: 0 },
            metricsB: { sent: 0, opened: 0, revenue: 0 },
          }
        : undefined,
    };

    marketingStorage.createCampaign(payload);
    void navigate({ to: "/admin/campaigns" });
  };

  const stepTitles = [
    "Core Details & Objectives",
    "Target Audience Segment",
    "Composed Message Builder",
    "Delivery Scheduling",
    "Final Review & Launch",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => void navigate({ to: "/admin/campaigns" })}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-500 transition-all cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <PageHeader
          title="Create Marketing Campaign"
          description="Design multi-channel growth runs, segment profiles, draft messages, and configure delivery parameters."
          breadcrumbs={[
            { label: "Marketing Hub", to: "/admin/marketing" },
            { label: "Campaigns", to: "/admin/campaigns" },
            { label: "Create Wizard" },
          ]}
        />
      </div>

      {/* Progress timeline tracker */}
      <div className="grid grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="space-y-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                s <= step
                  ? "bg-[#0E4825] dark:bg-emerald-500 shadow-[0_2px_8px_rgba(14,72,37,0.15)]"
                  : "bg-gray-200 dark:bg-gray-800"
              }`}
            />
            <span
              className={`hidden md:block text-[10px] font-black uppercase tracking-wider ${
                s === step ? "text-[#0E4825] dark:text-emerald-400 font-extrabold" : "text-gray-400"
              }`}
            >
              Step {s}: {stepTitles[s - 1].split(" ")[0]}
            </span>
          </div>
        ))}
      </div>

      {/* Wizard Content Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <AdminCard title={`Step ${step} of 5: ${stepTitles[step - 1]}`}>
            {/* STEP 1: OBJECTIVES & DETAILS */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                    Campaign Name
                  </label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. Ahmedabad Sunday Fries Blast"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-4 py-3 text-sm focus:border-[#0E4825] focus:outline-none dark:text-white"
                  />
                  <p className="text-[10px] text-gray-400">
                    A unique, scannable title used internally to search your marketing ledger.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                    Description / Internal Notes
                  </label>
                  <textarea
                    value={campaignDesc}
                    onChange={(e) => setCampaignDesc(e.target.value)}
                    placeholder="Brief outline explaining the offer goals, targeted locations, or promo structures..."
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-4 py-3 text-sm focus:border-[#0E4825] focus:outline-none h-24 dark:text-white resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                    Campaign Strategic Objective
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      "Sales Conversion",
                      "User Retention",
                      "Brand Awareness",
                      "Re-engagement",
                      "Feedback Survey",
                    ].map((obj) => (
                      <button
                        key={obj}
                        type="button"
                        onClick={() => setObjective(obj)}
                        className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left text-xs font-bold transition-all ${
                          objective === obj
                            ? "border-[#0E4825] bg-[#0E4825]/5 text-[#0E4825] dark:border-emerald-500 dark:text-emerald-400 dark:bg-emerald-950/20 shadow-sm"
                            : "border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        <Megaphone size={14} className="shrink-0 text-[#FF6600]" />
                        <span>{obj}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                    Gateway Channels (Multi-Select)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { id: "Push", label: "App Push", icon: Bell },
                      { id: "WhatsApp", label: "WhatsApp", icon: Phone },
                      { id: "SMS", label: "SMS Gateway", icon: MessageSquare },
                      { id: "Email", label: "Email Blast", icon: Mail },
                    ].map((item) => {
                      const isSelected = channels.includes(item.id);
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleChannel(item.id)}
                          className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center gap-2 transition-all ${
                            isSelected
                              ? "border-[#0E4825] bg-[#0E4825]/5 text-[#0E4825] dark:border-emerald-500 dark:text-emerald-400 dark:bg-emerald-950/20 shadow-sm"
                              : "border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          <Icon size={18} />
                          <span className="text-[10px] font-black uppercase tracking-wider">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: TARGET AUDIENCE */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                    Target Recipient Filter
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: "Entire Base",
                        label: "Entire Customer Base",
                        desc: "Dispatch to all registered profiles",
                      },
                      {
                        id: "Custom Segment",
                        label: "Custom Segment Vault",
                        desc: "Use saved smart-query filters",
                      },
                      {
                        id: "City Specific",
                        label: "City Specific Cohort",
                        desc: "Filter users living in certain cities",
                      },
                      {
                        id: "Store Specific",
                        label: "Preferred Store Cohort",
                        desc: "Filter by customer preferred store",
                      },
                      {
                        id: "VIP",
                        label: "Loyalty VIP Tier",
                        desc: "Target top premium members (VIP, Platinum)",
                      },
                      {
                        id: "Manual Selection",
                        label: "Manual Direct List",
                        desc: "Select specific individual customers",
                      },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setAudienceType(item.id)}
                        className={`p-4 rounded-2xl border text-left transition-all space-y-1 ${
                          audienceType === item.id
                            ? "border-[#0E4825] bg-[#0E4825]/5 text-[#0E4825] dark:border-emerald-500 dark:text-emerald-400 dark:bg-emerald-950/20 shadow-sm"
                            : "border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Users size={14} className="text-[#FF6600]" />
                          <span className="text-xs font-bold uppercase tracking-wider">
                            {item.label}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-medium">{item.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sub configuration options depending on audience choice */}
                {audienceType === "Custom Segment" && (
                  <div className="space-y-2 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                      Choose Segment Vault query
                    </label>
                    <select
                      value={selectedSegmentId}
                      onChange={(e) => setSelectedSegmentId(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-4 py-3 text-sm focus:outline-none dark:text-white"
                    >
                      <option value="">-- Choose Segment --</option>
                      {segments.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.description})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {audienceType === "City Specific" && (
                  <div className="space-y-2 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                      Select target city
                    </label>
                    <select
                      value={selectedCity}
                      onChange={(e) => setSelectedCity(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-4 py-3 text-sm focus:outline-none dark:text-white"
                    >
                      <option value="Ahmedabad">Ahmedabad</option>
                      <option value="Delhi">Delhi</option>
                      <option value="Noida">Noida</option>
                    </select>
                  </div>
                )}

                {audienceType === "Store Specific" && (
                  <div className="space-y-2 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                      Select target store outlet
                    </label>
                    <select
                      value={selectedStore}
                      onChange={(e) => setSelectedStore(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-4 py-3 text-sm focus:outline-none dark:text-white"
                    >
                      <option value="Burgonomics Navrangpura">Burgonomics Navrangpura</option>
                      <option value="Burgonomics Science City">Burgonomics Science City</option>
                      <option value="Connaught Place, Delhi">Connaught Place, Delhi</option>
                      <option value="Sector 62, Noida">Sector 62, Noida</option>
                    </select>
                  </div>
                )}

                {audienceType === "Manual Selection" && (
                  <div className="space-y-2 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                      Check customers to target (Selected: {selectedCustomerIds.length})
                    </label>
                    <div className="max-h-[220px] overflow-y-auto space-y-2 pr-2">
                      {customers.map((cust) => (
                        <div
                          key={cust.id}
                          onClick={() => toggleCustomerSelection(cust.id)}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-gray-200/50 dark:border-gray-850 bg-white dark:bg-black cursor-pointer hover:border-[#0E4825]"
                        >
                          <div className="flex items-center gap-2.5">
                            <img src={cust.avatar} className="h-7 w-7 rounded-full object-cover" />
                            <div>
                              <span className="block text-xs font-bold dark:text-white">
                                {cust.fullName}
                              </span>
                              <span className="block text-[10px] text-gray-400">
                                {cust.phone} • {cust.city}
                              </span>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedCustomerIds.includes(cust.id)}
                            onChange={() => {}} // handled by div click
                            className="h-4 w-4 rounded-md border-gray-300 accent-[#0E4825]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: MESSAGE COMPOSER */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                    Message Notification Title / Header
                  </label>
                  <input
                    type="text"
                    value={msgTitle}
                    onChange={(e) => setMsgTitle(e.target.value)}
                    placeholder="e.g. Free Peri-Peri Fries Today! 🍟"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-4 py-3 text-sm focus:border-[#0E4825] focus:outline-none dark:text-white"
                  />
                  <p className="text-[10px] text-gray-400">
                    Supports template variables like{" "}
                    <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
                      {"{{customer_name}}"}
                    </code>
                    .
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                    Message Body Text
                  </label>
                  <textarea
                    value={msgBody}
                    onChange={(e) => setMsgBody(e.target.value)}
                    placeholder="Hi {{customer_name}}, craving a premium snack? Order your burger on our app and get Peri-Peri fries + shake FREE! Valid today at {{store_name}}."
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-4 py-3 text-sm focus:border-[#0E4825] focus:outline-none h-28 dark:text-white resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                      Promotion Image URL (Optional)
                    </label>
                    <input
                      type="text"
                      value={msgImage}
                      onChange={(e) => setMsgImage(e.target.value)}
                      placeholder="https://images.unsplash.com/..."
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-4 py-3 text-sm focus:outline-none dark:text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                      Associated Coupon Code (Optional)
                    </label>
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="e.g. DAMNGOOD50"
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-4 py-3 text-sm focus:outline-none dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                    In-App Routing deep link (Optional)
                  </label>
                  <input
                    type="text"
                    value={deepLink}
                    onChange={(e) => setDeepLink(e.target.value)}
                    placeholder="burgonomics://menu/fries"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-4 py-3 text-sm focus:outline-none dark:text-white"
                  />
                </div>
              </div>
            )}

            {/* STEP 4: DELIVERY SCHEDULING */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                    Dispatch Time Slot
                  </label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setScheduleType("now")}
                      className={`flex-1 flex flex-col items-center justify-center p-5 rounded-2xl border text-center gap-2 transition-all ${
                        scheduleType === "now"
                          ? "border-[#0E4825] bg-[#0E4825]/5 text-[#0E4825] dark:border-emerald-500 dark:text-emerald-400 dark:bg-emerald-950/20 shadow-sm"
                          : "border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      <Sparkles size={18} className="text-[#FF6600]" />
                      <span className="text-xs font-black uppercase tracking-wider">
                        Send Instantly
                      </span>
                      <p className="text-[10px] text-gray-400 font-medium">
                        Broadcasts instantly over active gateways
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setScheduleType("later")}
                      className={`flex-1 flex flex-col items-center justify-center p-5 rounded-2xl border text-center gap-2 transition-all ${
                        scheduleType === "later"
                          ? "border-[#0E4825] bg-[#0E4825]/5 text-[#0E4825] dark:border-emerald-500 dark:text-emerald-400 dark:bg-emerald-950/20 shadow-sm"
                          : "border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      <Calendar size={18} className="text-[#0E4825]" />
                      <span className="text-xs font-black uppercase tracking-wider">
                        Schedule Ahead
                      </span>
                      <p className="text-[10px] text-gray-400 font-medium">
                        Queue delivery for optimal time slot
                      </p>
                    </button>
                  </div>
                </div>

                {scheduleType === "later" && (
                  <div className="space-y-2 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 animate-fadeIn">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                      Target Broadcast Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledDateTime}
                      onChange={(e) => setScheduledDateTime(e.target.value)}
                      className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-4 py-3 text-sm focus:outline-none dark:text-white"
                    />
                  </div>
                )}

                <div className="border-t border-gray-100 dark:border-gray-800 pt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Enable A/B Subject split testing
                      </span>
                      <p className="text-[10px] text-gray-400 font-medium">
                        Dispatches split subjects to 20% test audience, sending winner variant to
                        the remainder.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAbTestingEnabled(!abTestingEnabled)}
                      className={`w-12 h-6 rounded-full p-0.5 transition-all cursor-pointer ${
                        abTestingEnabled ? "bg-[#0E4825]" : "bg-gray-200 dark:bg-gray-800"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-all transform ${
                          abTestingEnabled ? "translate-x-6" : ""
                        }`}
                      />
                    </button>
                  </div>

                  {abTestingEnabled && (
                    <div className="space-y-4 p-4 rounded-2xl bg-orange-50/10 dark:bg-orange-950/5 border border-orange-200/20 animate-fadeIn">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                          Subject Variant A (Control)
                        </label>
                        <input
                          type="text"
                          value={abSubjectA}
                          onChange={(e) => setAbSubjectA(e.target.value)}
                          placeholder="e.g. Rainy Day Burger Combo BOGO! 🌧️🍔"
                          className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-4 py-3 text-sm focus:outline-none dark:text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                          Subject Variant B (Test Hook)
                        </label>
                        <input
                          type="text"
                          value={abSubjectB}
                          onChange={(e) => setAbSubjectB(e.target.value)}
                          placeholder="e.g. Hot Burgers on a Rainy Day? Buy 1 Get 1 FREE! 🔥"
                          className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black px-4 py-3 text-sm focus:outline-none dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 5: REVIEW & LAUNCH */}
            {step === 5 && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-[#0E4825]/20 bg-[#0E4825]/5 p-5 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#0E4825] text-white">
                      <Check size={16} />
                    </span>
                    <h4 className="font-bold text-sm text-[#0E4825] dark:text-emerald-400 uppercase tracking-wider">
                      Ready to Broadcast
                    </h4>
                  </div>
                  <p className="text-xs text-gray-500">
                    Your campaign structures are validated. Proceeding to launch will queue
                    dispatches on the active providers immediately.
                  </p>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-800 space-y-4 text-xs">
                  <div className="flex justify-between py-2 pt-0">
                    <span className="text-gray-400 font-bold uppercase tracking-wider">
                      Campaign Name:
                    </span>
                    <span className="font-extrabold text-gray-800 dark:text-gray-200">
                      {campaignName}
                    </span>
                  </div>

                  <div className="flex justify-between py-3">
                    <span className="text-gray-400 font-bold uppercase tracking-wider">
                      Objective:
                    </span>
                    <span className="font-extrabold text-[#FF6600]">{objective}</span>
                  </div>

                  <div className="flex justify-between py-3">
                    <span className="text-gray-400 font-bold uppercase tracking-wider">
                      Target Segment:
                    </span>
                    <span className="font-extrabold text-gray-800 dark:text-gray-200">
                      {audienceType}{" "}
                      {audienceType === "Custom Segment" &&
                        `(${segments.find((s) => s.id === selectedSegmentId)?.name})`}
                    </span>
                  </div>

                  <div className="flex justify-between py-3">
                    <span className="text-gray-400 font-bold uppercase tracking-wider">
                      Delivery Channels:
                    </span>
                    <span className="font-extrabold text-[#0E4825] dark:text-emerald-400">
                      {channels.join(", ")}
                    </span>
                  </div>

                  {couponCode && (
                    <div className="flex justify-between py-3">
                      <span className="text-gray-400 font-bold uppercase tracking-wider">
                        Promo Coupon:
                      </span>
                      <span className="font-mono font-black text-xs text-[#FF6600] bg-orange-50 dark:bg-orange-950/20 px-2 py-0.5 rounded border border-orange-200/50">
                        {couponCode}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between py-3">
                    <span className="text-gray-400 font-bold uppercase tracking-wider">
                      Dispatch timing:
                    </span>
                    <span className="font-extrabold text-gray-800 dark:text-gray-200">
                      {scheduleType === "now"
                        ? "Immediate Delivery"
                        : `Scheduled for ${scheduledDateTime}`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation footer of card */}
            <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-5 mt-6">
              {step > 1 ? (
                <AdminButton variant="secondary" size="sm" onClick={handlePrev}>
                  <ArrowLeft size={14} />
                  <span>Previous</span>
                </AdminButton>
              ) : (
                <div />
              )}

              {step < 5 ? (
                <AdminButton
                  variant="primary"
                  size="sm"
                  onClick={handleNext}
                  disabled={!validateStep()}
                >
                  <span>Continue</span>
                  <ArrowRight size={14} />
                </AdminButton>
              ) : (
                <AdminButton
                  variant="primary"
                  size="sm"
                  onClick={handleLaunch}
                  className="bg-gradient-to-r from-[#0E4825] to-[#FF6600]"
                >
                  <Megaphone size={14} />
                  <span>Launch Broadcast Campaign</span>
                </AdminButton>
              )}
            </div>
          </AdminCard>
        </div>

        {/* STEP RIGHT COLS: PHONE PREVIEW MODULE */}
        <div className="space-y-6">
          <AdminCard
            title="Channel Mock Preview"
            subtitle="Simulated mock of how the alert renders on customer phone"
          >
            {/* Phone shell container */}
            <div className="relative mx-auto max-w-[280px] h-[520px] rounded-[36px] border-[12px] border-gray-900 dark:border-gray-800 bg-gray-100 dark:bg-[#121212] overflow-hidden shadow-2xl flex flex-col">
              {/* Phone ear-speaker Notch */}
              <div className="absolute top-0 inset-x-0 h-4 bg-gray-900 dark:bg-gray-800 flex items-center justify-center z-30">
                <div className="w-16 h-2 rounded-full bg-black" />
              </div>

              {/* Screen Content */}
              <div
                className="flex-1 p-4 pt-8 flex flex-col justify-start relative z-10 bg-cover bg-center overflow-y-auto"
                style={{
                  backgroundImage: `url('https://images.unsplash.com/photo-1548345680-f5475ea5df84?w=300&auto=format&fit=crop&q=40')`,
                }}
              >
                <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px] z-0" />

                <div className="relative z-10 space-y-4">
                  {/* Lock screen Clock */}
                  <div className="text-center text-white space-y-0.5 py-4">
                    <span className="block text-3xl font-light tracking-tight font-sans">
                      08:42
                    </span>
                    <span className="block text-[9px] font-bold uppercase tracking-widest text-gray-200">
                      Sunday, July 19
                    </span>
                  </div>

                  {/* Render preview card according to channels */}
                  {channels.map((chan) => {
                    const titleText = msgTitle || "Your promotion Title Here";
                    const bodyText =
                      msgBody ||
                      "Your detailed promotional marketing campaign message body will be previewed here in real-time as you compose it...";
                    const hasImage = msgImage && msgImage.trim().length > 0;

                    if (chan === "Push") {
                      return (
                        <div
                          key={chan}
                          className="rounded-2xl bg-white/90 dark:bg-[#1A1A1A]/95 p-3.5 shadow-lg border border-white/25 dark:border-gray-800/10 backdrop-blur-md animate-fadeIn text-gray-900 dark:text-white"
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="flex h-4 w-4 items-center justify-center rounded bg-[#0E4825] text-white font-extrabold text-[8px]">
                              B
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                              BURGONOMICS
                            </span>
                            <span className="text-[8px] text-gray-400 font-mono ml-auto">now</span>
                          </div>
                          <h6 className="font-extrabold text-xs">{titleText}</h6>
                          <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">
                            {bodyText}
                          </p>
                          {hasImage && (
                            <img
                              src={msgImage}
                              className="mt-2 rounded-xl h-24 w-full object-cover border border-gray-100"
                            />
                          )}
                        </div>
                      );
                    }

                    if (chan === "WhatsApp") {
                      return (
                        <div
                          key={chan}
                          className="rounded-2xl bg-[#DCF8C6]/95 p-3.5 shadow-lg border border-green-200/50 backdrop-blur-md animate-fadeIn text-gray-900"
                        >
                          <div className="flex items-center gap-1.5 mb-1 text-[8px] font-black uppercase tracking-widest text-green-700">
                            <Phone size={8} />
                            <span>BURGONOMICS SUPPORT</span>
                            <span className="ml-auto text-[7px] text-green-600">08:42 AM</span>
                          </div>
                          {hasImage && (
                            <img
                              src={msgImage}
                              className="mb-2 rounded-xl h-24 w-full object-cover"
                            />
                          )}
                          <p className="text-[10px] leading-relaxed font-sans">{bodyText}</p>
                          {couponCode && (
                            <div className="mt-2 bg-white/80 p-1.5 rounded-lg border border-dashed border-green-400 text-center text-[10px] font-bold font-mono text-[#0E4825]">
                              Code: {couponCode}
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (chan === "SMS") {
                      return (
                        <div
                          key={chan}
                          className="rounded-2xl bg-gray-200/90 dark:bg-gray-900/95 p-3.5 shadow-lg backdrop-blur-md animate-fadeIn text-gray-900 dark:text-white"
                        >
                          <div className="flex items-center gap-1.5 mb-1.5 text-[8px] font-black uppercase tracking-widest text-gray-400">
                            <MessageSquare size={8} />
                            <span>VZ-BURGMC</span>
                            <span className="ml-auto">now</span>
                          </div>
                          <p className="text-[10px] leading-relaxed font-mono">{bodyText}</p>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              </div>

              {/* Home Indicator swipe-bar */}
              <div className="absolute bottom-1 inset-x-0 h-1.5 flex items-center justify-center z-20">
                <div className="w-24 h-1 rounded-full bg-black dark:bg-gray-700" />
              </div>
            </div>
          </AdminCard>
        </div>
      </div>
    </div>
  );
};
