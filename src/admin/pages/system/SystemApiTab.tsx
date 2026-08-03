import React, { useState } from "react";
import { motion } from "motion/react";
import { Network, Globe, Search, Lock, Unlock, Play, Send, Sparkles } from "lucide-react";

interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  route: string;
  group:
    "Auth" | "Orders" | "Stores" | "Customers" | "Payments" | "Petpooja" | "Health" | "Developer";
  auth: boolean;
  rateLimit: string;
  description: string;
  requestSchema?: string;
  responseSchema?: string;
}

const DISCOVERED_APIS: ApiEndpoint[] = [
  {
    method: "POST",
    route: "/api/auth/otp/request",
    group: "Auth",
    auth: false,
    rateLimit: "3 req / min / IP",
    description:
      "Generate dynamic 6-digit OTP code and send with fallback routing to SMS/WhatsApp gateway.",
    requestSchema: JSON.stringify({ phone: "9876543210", deliveryMethod: "whatsapp" }, null, 2),
    responseSchema: JSON.stringify(
      { success: true, data: { otpToken: "otp_abc123", simulated: true, code: "123456" } },
      null,
      2,
    ),
  },
  {
    method: "POST",
    route: "/api/auth/otp/verify",
    group: "Auth",
    auth: false,
    rateLimit: "5 attempts / token",
    description:
      "Validate a challenges OTP verification code. Deletes OTP token immediately on success.",
    requestSchema: JSON.stringify({ otpToken: "otp_abc123", code: "123456" }, null, 2),
    responseSchema: JSON.stringify(
      {
        success: true,
        data: { accessToken: "jwt_tok_...", user: { id: "usr_...", phone: "98..." } },
      },
      null,
      2,
    ),
  },
  {
    method: "GET",
    route: "/api/orders/history",
    group: "Orders",
    auth: true,
    rateLimit: "60 req / min",
    description:
      "Fetch list of past checked-out customer orders. Supports date limits and pagination.",
    responseSchema: JSON.stringify(
      { success: true, data: [{ orderId: "ord_1", storeId: "store_1", total: 450 }] },
      null,
      2,
    ),
  },
  {
    method: "POST",
    route: "/api/petpooja/menu/sync",
    group: "Petpooja",
    auth: true,
    rateLimit: "5 syncs / hour",
    description:
      "Trigger manual pulling scrape and database synchronization of menu card nodes from POS gateway.",
    requestSchema: JSON.stringify({ storeId: "connaught_place", syncGroups: ["menu"] }, null, 2),
    responseSchema: JSON.stringify(
      { success: true, data: { syncId: "sync_3921", mutations: { created: 1 } } },
      null,
      2,
    ),
  },
  {
    method: "GET",
    route: "/metrics",
    group: "Health",
    auth: false,
    rateLimit: "No limit",
    description: "Expose standard Prometheus scraper node metrics feed in plaintext format.",
    responseSchema: "# HELP http_requests_total Total requests\nhttp_requests_total 42914",
  },
];

export const SystemApiTab: React.FC = () => {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>(DISCOVERED_APIS);
  const [selectedApi, setSelectedApi] = useState<ApiEndpoint | null>(null);
  const [activeGroup, setActiveGroup] = useState<"all" | "Auth" | "Orders" | "Petpooja" | "Health">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [testPayload, setTestPayload] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const handleSelectApi = (api: ApiEndpoint) => {
    setSelectedApi(api);
    setTestPayload(api.requestSchema || "{\n  \n}");
    setTestResponse("");
  };

  const handleTriggerTest = async () => {
    if (!selectedApi) return;
    setIsTesting(true);
    setTestResponse("");

    // Fast simulation of REST API tests with real-like execution times
    setTimeout(() => {
      try {
        if (selectedApi.route.includes("request")) {
          setTestResponse(
            JSON.stringify(
              {
                status: 200,
                headers: { "content-type": "application/json" },
                body: {
                  success: true,
                  data: {
                    otpToken: "otp_test_" + Math.random().toString(36).substring(7),
                    expiresInSec: 300,
                    resendAfterSec: 30,
                    code: "123456",
                    simulated: true,
                    deliveryMethod: "whatsapp",
                  },
                },
              },
              null,
              2,
            ),
          );
        } else if (selectedApi.route.includes("/metrics")) {
          setTestResponse(
            `HTTP/1.1 200 OK\nContent-Type: text/plain; version=0.0.4\n\n# HELP petpooja_api_latency_seconds Latency of Petpooja API\npetpooja_api_latency_seconds{quantile="0.5"} 0.135\npetpooja_api_latency_seconds_count 1450`,
          );
        } else {
          // General mock response matching schema
          setTestResponse(
            JSON.stringify(
              {
                status: 200,
                headers: { "content-type": "application/json" },
                body: JSON.parse(selectedApi.responseSchema || '{"success":true}'),
              },
              null,
              2,
            ),
          );
        }
      } catch (err) {
        setTestResponse(
          "JSON Payload formatting exception while assembling request client properties.",
        );
      } finally {
        setIsTesting(false);
      }
    }, 1200);
  };

  const filteredApis = endpoints.filter((api) => {
    const matchesGroup = activeGroup === "all" || api.group === activeGroup;
    const matchesSearch =
      api.route.toLowerCase().includes(searchQuery.toLowerCase()) ||
      api.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "POST":
        return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case "PUT":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      default:
        return "text-red-400 bg-red-500/10 border-red-500/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* Upper overview status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 shrink-0 gap-4">
        <div>
          <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
            AUTOMATIC API SCHEMA EXPLORER
          </h3>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
            Discover rest controllers, authenticate tokens, test endpoints, and monitor rate limit
            quotas
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 bg-[#0c130e] border border-gray-800 rounded-xl px-3.5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-gray-300 font-bold">18 Endpoints Registered</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Endpoints Discovery Manifest */}
        <div className="lg:col-span-2 p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
            <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
              Live REST Mapping Suite
            </span>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-black/40 border border-gray-800 rounded-lg px-2 py-1">
                <Search size={12} className="text-gray-500" />
                <input
                  type="text"
                  placeholder="Search routes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-0 outline-none text-[11px] text-white placeholder-gray-600 font-mono w-[110px]"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-b border-gray-900 pb-2 overflow-x-auto no-scrollbar">
            {["all", "Auth", "Orders", "Petpooja", "Health"].map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroup(g as any)}
                className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider font-mono ${
                  activeGroup === g
                    ? "bg-[#0E4825] text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto custom-scrollbar">
            {filteredApis.map((api) => (
              <div
                key={api.route}
                onClick={() => handleSelectApi(api)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  selectedApi?.route === api.route
                    ? "bg-[#0E4825]/15 border-emerald-700/50"
                    : "bg-black/30 border-gray-900/60 hover:border-gray-800"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono ${getMethodColor(api.method)}`}
                  >
                    {api.method}
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-white font-mono break-all leading-tight">
                      {api.route}
                    </span>
                    <span className="block text-[10px] text-gray-500 mt-1 leading-relaxed max-w-[400px]">
                      {api.description}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono shrink-0">
                  <div className="text-right text-[10px]">
                    <span className="block text-gray-500">Rate Limit:</span>
                    <span className="text-gray-400 font-bold">{api.rateLimit}</span>
                  </div>
                  {api.auth ? (
                    <span title="Token Authorization needed">
                      <Lock size={12} className="text-red-400" />
                    </span>
                  ) : (
                    <span title="Anonymous route">
                      <Unlock size={12} className="text-emerald-400" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* REST Testing Client Sandbox */}
        <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col justify-between">
          <div className="space-y-4 flex-1 flex flex-col justify-between">
            <div>
              <div className="border-b border-gray-800 pb-3 flex items-center justify-between">
                <span className="font-mono text-xs font-black text-emerald-400 uppercase tracking-widest">
                  REST Sandbox
                </span>
              </div>

              {selectedApi ? (
                <div className="space-y-4 font-mono text-xs mt-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${getMethodColor(selectedApi.method)}`}
                    >
                      {selectedApi.method}
                    </span>
                    <span className="text-[11px] font-bold text-white break-all">
                      {selectedApi.route}
                    </span>
                  </div>

                  {selectedApi.requestSchema && (
                    <div>
                      <span className="block text-[9px] text-gray-500 uppercase font-bold mb-1">
                        Body Params (JSON)
                      </span>
                      <textarea
                        value={testPayload}
                        onChange={(e) => setTestPayload(e.target.value)}
                        className="w-full h-[100px] bg-black text-gray-300 border border-gray-900 rounded-lg p-2 font-mono text-[9px] outline-none focus:border-emerald-700 select-all leading-normal"
                      />
                    </div>
                  )}

                  <button
                    onClick={handleTriggerTest}
                    disabled={isTesting}
                    className="w-full py-2 bg-[#0E4825] hover:bg-[#156d39] disabled:opacity-40 text-white rounded-lg flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    <Send size={12} className={isTesting ? "animate-spin" : ""} />
                    <span>{isTesting ? "Sending Request..." : "Test Endpoint"}</span>
                  </button>
                </div>
              ) : (
                <div className="py-20 text-center space-y-2">
                  <Network size={24} className="text-gray-700 mx-auto animate-pulse" />
                  <p className="text-xs text-gray-500 font-mono">
                    Select a registered endpoint row to load REST sandbox variables
                  </p>
                </div>
              )}
            </div>

            {testResponse && (
              <div className="mt-4 pt-4 border-t border-gray-800">
                <span className="block text-[9px] text-gray-500 uppercase font-bold mb-1">
                  REST Response Payload
                </span>
                <pre className="p-2.5 rounded-lg bg-black text-emerald-400 border border-gray-950 font-mono text-[9px] overflow-y-auto select-all max-h-[160px] leading-relaxed break-all whitespace-pre">
                  {testResponse}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
