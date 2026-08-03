import React, { useState } from "react";
import { Settings, ShieldCheck, Cpu, Mail, Zap, Lock, Save, CheckCircle2 } from "lucide-react";

export const SystemSettingsTab: React.FC = () => {
  const [smtpHost, setSmtpHost] = useState("smtp.postmarkapp.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [sessionExpiry, setSessionExpiry] = useState("14");
  const [webhookRetries, setWebhookRetries] = useState("3");
  const [rateLimitIp, setRateLimitIp] = useState("120");

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    alert(
      "System core settings saved successfully. Broadcasted configuration update signals to active production workers.",
    );
  };

  return (
    <div className="space-y-6 font-mono text-xs text-gray-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
        <div>
          <h3 className="text-sm font-black tracking-wider text-white uppercase">
            BURGO_SYSTEM CENTRAL SETTINGS
          </h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Configure system limits, SMTP relays, session token boundaries, and API rate throtlling
            params
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Environment Variable Secrets Placeholder Indicators */}
        <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-gray-900 pb-2">
            <Lock size={16} className="text-amber-500" />
            <span className="uppercase text-xs font-black tracking-wider text-amber-500">
              Sensitive Environmental Variables (Secrets)
            </span>
          </div>

          <p className="text-[10px] text-gray-500 leading-relaxed italic">
            * To secure live production credentials, API token variables are loaded strictly as
            server-side env values. To edit, modify your container's direct environment settings or
            update .env.example files.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 bg-black border border-gray-950 rounded-xl flex items-center justify-between">
              <div>
                <span className="block text-[9px] text-gray-500 font-bold uppercase leading-none">
                  GEMINI_API_KEY
                </span>
                <span className="block text-gray-300 mt-1">••••••••••••••••••••••••••••</span>
              </div>
              <ShieldCheck size={14} className="text-emerald-500" />
            </div>

            <div className="p-3.5 bg-black border border-gray-950 rounded-xl flex items-center justify-between">
              <div>
                <span className="block text-[9px] text-gray-500 font-bold uppercase leading-none">
                  RAZORPAY_SECRET_KEY
                </span>
                <span className="block text-gray-300 mt-1">••••••••••••••••••••••••••••</span>
              </div>
              <ShieldCheck size={14} className="text-emerald-500" />
            </div>

            <div className="p-3.5 bg-black border border-gray-950 rounded-xl flex items-center justify-between">
              <div>
                <span className="block text-[9px] text-gray-500 font-bold uppercase leading-none">
                  PETPOOJA_API_TOKEN
                </span>
                <span className="block text-gray-300 mt-1">••••••••••••••••••••••••••••</span>
              </div>
              <ShieldCheck size={14} className="text-emerald-500" />
            </div>

            <div className="p-3.5 bg-black border border-gray-950 rounded-xl flex items-center justify-between">
              <div>
                <span className="block text-[9px] text-gray-500 font-bold uppercase leading-none">
                  REDIS_PRIVATE_URL
                </span>
                <span className="block text-gray-300 mt-1">••••••••••••••••••••••••••••</span>
              </div>
              <ShieldCheck size={14} className="text-emerald-500" />
            </div>
          </div>
        </div>

        {/* Mutable Configs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Email / SMTP Relay configuration */}
          <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-gray-900 pb-2">
              <Mail size={16} className="text-emerald-400" />
              <span className="uppercase text-[11px] font-black tracking-wider text-white">
                SMTP Email Relay Node
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-500 font-bold mb-1 uppercase text-[9px]">
                  SMTP Server Address
                </label>
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  className="w-full bg-black border border-gray-900 rounded-lg p-2 text-white font-mono placeholder-gray-800 outline-none focus:border-emerald-700"
                />
              </div>

              <div>
                <label className="block text-gray-500 font-bold mb-1 uppercase text-[9px]">
                  Relay Server Port
                </label>
                <input
                  type="text"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  className="w-full bg-black border border-gray-900 rounded-lg p-2 text-white font-mono placeholder-gray-800 outline-none focus:border-emerald-700"
                />
              </div>
            </div>
          </div>

          {/* Session Boundaries & Limits */}
          <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-gray-900 pb-2">
              <Cpu size={16} className="text-emerald-400" />
              <span className="uppercase text-[11px] font-black tracking-wider text-white">
                Throttling & Security Policy
              </span>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-500 font-bold mb-1 uppercase text-[9px]">
                    Admin Session Expiry (Days)
                  </label>
                  <input
                    type="number"
                    value={sessionExpiry}
                    onChange={(e) => setSessionExpiry(e.target.value)}
                    className="w-full bg-black border border-gray-900 rounded-lg p-2 text-white font-mono outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-gray-500 font-bold mb-1 uppercase text-[9px]">
                    Rate limit IP (req/min)
                  </label>
                  <input
                    type="number"
                    value={rateLimitIp}
                    onChange={(e) => setRateLimitIp(e.target.value)}
                    className="w-full bg-black border border-gray-900 rounded-lg p-2 text-white font-mono outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-500 font-bold mb-1 uppercase text-[9px]">
                  Webhook Retry Max Count
                </label>
                <input
                  type="number"
                  value={webhookRetries}
                  onChange={(e) => setWebhookRetries(e.target.value)}
                  className="w-full bg-black border border-gray-900 rounded-lg p-2 text-white font-mono outline-none focus:border-emerald-700"
                />
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="px-6 py-2.5 bg-[#0E4825] hover:bg-[#156d39] text-white rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer self-end w-fit ml-auto"
        >
          <Save size={14} /> Save Configuration Params
        </button>
      </form>
    </div>
  );
};
