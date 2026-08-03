import React, { useState, useEffect, useCallback } from "react";
import { Search, Plus, Trash2, Sparkles, RefreshCw } from "lucide-react";
import { useAdminAuthStore } from "../../store/adminAuthStore";

interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
}

export const SystemFeatureFlagsTab: React.FC = () => {
  const { accessToken } = useAdminAuthStore();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const fetchFlags = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/v1/feature-flags", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setFlags(data);
      }
    } catch (err) {
      console.error("Failed to fetch feature flags from backend", err);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const handleToggle = async (key: string, currentEnabled: boolean, desc: string | null) => {
    if (!accessToken) return;
    try {
      const response = await fetch("/api/v1/feature-flags", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          enabled: !currentEnabled,
          description: desc || undefined,
        }),
      });
      if (response.ok) {
        fetchFlags();
      }
    } catch (err) {
      console.error("Failed to toggle feature flag", err);
    }
  };

  const handleDelete = async (key: string) => {
    if (!accessToken) return;
    try {
      const response = await fetch(`/api/v1/feature-flags/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        fetchFlags();
      }
    } catch (err) {
      console.error("Failed to delete feature flag", err);
    }
  };

  const handleAddFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !accessToken) return;

    const formattedKey = newKey.replace(/\s+/g, "_").toLowerCase();

    try {
      const response = await fetch("/api/v1/feature-flags", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: formattedKey,
          enabled: false,
          description: newDesc || undefined,
        }),
      });
      if (response.ok) {
        fetchFlags();
        setNewKey("");
        setNewDesc("");
        setIsAdding(false);
      }
    } catch (err) {
      console.error("Failed to create feature flag", err);
    }
  };

  const filteredFlags = flags.filter(
    (f) =>
      f.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
        <div>
          <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
            FEATURE FLAG SEGMENTATIONS
          </h3>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
            Safely toggle features, route gateways, run A/B tests, or throttle API loads on the fly
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono">
          <div className="flex items-center gap-1 bg-[#0c130e] border border-gray-800 rounded-lg px-2.5 py-1 text-[11px]">
            <Search size={12} className="text-gray-500" />
            <input
              type="text"
              placeholder="Search flags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-0 outline-none text-white font-mono placeholder-gray-600 w-[120px]"
            />
          </div>

          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-3 py-1.5 bg-[#0E4825] hover:bg-[#156d39] text-white text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus size={12} /> Create Flag
          </button>

          <button
            onClick={fetchFlags}
            className="p-1.5 rounded-lg bg-black border border-gray-800 text-gray-400 hover:text-white"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {isAdding && (
        <form
          onSubmit={handleAddFlag}
          className="p-5 rounded-2xl bg-[#0c130e] border border-gray-800 space-y-4 max-w-xl font-mono text-xs"
        >
          <h4 className="text-white font-bold uppercase tracking-wider text-[11px] border-b border-gray-900 pb-2 flex items-center gap-1">
            <Sparkles size={12} className="text-emerald-400" /> Assemble New Flag Parameters
          </h4>

          <div>
            <label className="block text-gray-500 font-bold mb-1 uppercase text-[9px]">
              Flag Key (Identifier)
            </label>
            <input
              type="text"
              placeholder="enable_stripe_checkout..."
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              required
              className="w-full bg-black border border-gray-900 rounded-lg p-2 text-white font-mono placeholder-gray-800 outline-none focus:border-emerald-700"
            />
          </div>

          <div>
            <label className="block text-gray-500 font-bold mb-1 uppercase text-[9px]">
              Description Purpose
            </label>
            <input
              type="text"
              placeholder="Detailed functional description for developers..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full bg-black border border-gray-900 rounded-lg p-2 text-white font-mono placeholder-gray-800 outline-none focus:border-emerald-700"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-900">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-gray-400 bg-gray-900 border border-gray-800 hover:text-white rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#0E4825] hover:bg-[#156d39] text-white rounded-lg cursor-pointer"
            >
              Initialize Flag
            </button>
          </div>
        </form>
      )}

      {/* Flags List Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredFlags.length === 0 ? (
          <div className="py-12 text-center text-gray-500 font-mono text-xs col-span-2">
            No feature flags found.
          </div>
        ) : (
          filteredFlags.map((flag) => (
            <div
              key={flag.key}
              className="p-5 rounded-[20px] bg-[#0c130e] border border-gray-800 flex flex-col justify-between hover:border-gray-700 transition-all shadow-md font-mono text-xs"
            >
              <div>
                <div className="flex items-start justify-between border-b border-gray-900 pb-2 gap-4">
                  <div>
                    <span className="block text-[10px] text-emerald-400 font-bold break-all leading-none">
                      {flag.key}
                    </span>
                    <span className="block text-xs font-black text-white mt-2 leading-tight">
                      {flag.key.replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>

                  <button
                    onClick={() => handleToggle(flag.key, flag.enabled, flag.description)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      flag.enabled ? "bg-[#0E4825]" : "bg-gray-800"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        flag.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <p className="text-[10px] text-gray-400 mt-2.5 leading-relaxed italic">
                  "{flag.description || "No description provided."}"
                </p>
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-900 text-[9px] text-gray-500 font-bold uppercase">
                <div className="flex items-center gap-1.5">
                  <span>Last Modified:</span>
                  <span className="text-gray-400">
                    {new Date(flag.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(flag.key)}
                  className="p-1 text-gray-700 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
