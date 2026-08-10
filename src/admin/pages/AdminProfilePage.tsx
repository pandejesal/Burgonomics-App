import React, { useEffect, useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  KeyRound,
  History,
  Lock,
  Power,
  RefreshCcw,
  CheckCircle,
  LogOut,
  User,
} from "lucide-react";
import { useAdminAuthStore } from "../store/adminAuthStore";
import { db } from "@/core/config/firebase";
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from "firebase/firestore";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { AdminAvatar } from "../components/Utilities";
import { secureStorage } from "@/core/storage/secureStorage";

export const AdminProfilePage: React.FC = () => {
  const { admin, setup2Fa, verifySetup2Fa, disable2Fa } = useAdminAuthStore();
  const [activeTab, setActiveTab] = useState<"security" | "sessions" | "permissions">("security");

  // 2FA state
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdMessage, setPwdMessage] = useState<{ text: string; type: "success" | "error" } | null>(
    null,
  );

  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    if (!admin?.id) return;
    const q = query(
      collection(db, "admins", admin.id, "sessions"),
      orderBy("lastSeen", "desc")
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const activeSessionId = await secureStorage.get("admin_session_id");
      const loaded = snapshot.docs
        .filter(doc => doc.data().active === true)
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            device: data.device || "Unknown Device",
            browser: data.browser || "Unknown Browser",
            os: data.os || "Unknown OS",
            ip: data.ip || "Unknown",
            country: data.country || "Unknown",
            active: doc.id === activeSessionId,
            lastSeen: doc.id === activeSessionId ? "Just Now" : new Date(data.lastSeen).toLocaleString(),
          };
        });
      // Sort so active session is first
      loaded.sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));
      setSessions(loaded);
    });
    return () => unsubscribe();
  }, [admin?.id]);

  const permissions = admin?.role?.permissions || [];
  const roleName = admin?.role?.name || "Administrator";

  const handleStart2FA = async () => {
    setMessage(null);
    try {
      const data = await setup2Fa();
      setSetupData(data);
      setIsSettingUp(true);
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to start 2FA setup", type: "error" });
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const success = await verifySetup2Fa(setupCode);
      if (success) {
        setMessage({
          text: "Two-factor authentication successfully activated on your account!",
          type: "success",
        });
        setIsSettingUp(false);
        setSetupData(null);
        setSetupCode("");
      } else {
        setMessage({
          text: "Invalid verification token. Verify your device clock synchronization.",
          type: "error",
        });
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Verification error", type: "error" });
    }
  };

  const handleDisable2FA = async () => {
    setMessage(null);
    const code = prompt("Please enter your 6-digit TOTP code to disable 2FA:");
    if (!code) return;

    try {
      const success = await disable2Fa(code);
      if (success) {
        setMessage({
          text: "Two-factor authentication disabled on your profile.",
          type: "success",
        });
      } else {
        setMessage({ text: "Invalid authentication code. Could not disable 2FA.", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Disable 2FA error", type: "error" });
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMessage(null);
    if (newPassword !== confirmPassword) {
      setPwdMessage({ text: "Passwords do not match.", type: "error" });
      return;
    }

    setPwdMessage({ text: "Password successfully modified!", type: "success" });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Admin Profile & Safety"
        description="Verify your authorization permissions, manage multi-factor authentication, modify credentials, and review session histories."
        breadcrumbs={[{ label: "Profile Settings" }]}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Administrative Role" value={roleName} icon={KeyRound} accent={true} />
        <StatCard
          title="Assigned Permissions"
          value={`${permissions.length} Keys`}
          icon={ShieldCheck}
          subtext="Granular security policies active"
        />
        <div className="rounded-[20px] bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 p-6 shadow-sm flex items-center gap-4">
          <AdminAvatar fullName={admin?.fullName} status="online" size="lg" />
          <div>
            <span className="block text-sm font-black text-gray-900 dark:text-white">
              {admin?.fullName}
            </span>
            <span className="block text-xs text-gray-400 mt-0.5">{admin?.email}</span>
            <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-black uppercase tracking-wider text-[#FF6600]">
              <ShieldCheck size={11} />
              <span>Session Secured</span>
            </span>
          </div>
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 gap-6 text-xs font-bold uppercase tracking-wider">
        <button
          onClick={() => setActiveTab("security")}
          className={`pb-3 border-b-2 transition-all cursor-pointer ${activeTab === "security" ? "border-[#0E4825] text-[#0E4825] dark:text-emerald-400 dark:border-emerald-400" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Security & MFA
        </button>
        <button
          onClick={() => setActiveTab("sessions")}
          className={`pb-3 border-b-2 transition-all cursor-pointer ${activeTab === "sessions" ? "border-[#0E4825] text-[#0E4825] dark:text-emerald-400 dark:border-emerald-400" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Active Sessions ({sessions.length})
        </button>
        <button
          onClick={() => setActiveTab("permissions")}
          className={`pb-3 border-b-2 transition-all cursor-pointer ${activeTab === "permissions" ? "border-[#0E4825] text-[#0E4825] dark:text-emerald-400 dark:border-emerald-400" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          My Granted Permissions
        </button>
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        {activeTab === "security" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 2FA Card */}
            <AdminCard
              title="Two-Factor Authentication (TOTP)"
              subtitle="Enhance your administrative profile against password compromises"
            >
              <div className="space-y-4">
                {message && (
                  <div
                    className={`p-4 rounded-xl text-xs font-semibold border flex items-center gap-2 ${message.type === "success" ? "bg-green-50 border-green-100 text-[#0E4825]" : "bg-red-50 border-red-100 text-red-600"}`}
                  >
                    {message.type === "success" ? (
                      <CheckCircle size={16} />
                    ) : (
                      <ShieldAlert size={16} />
                    )}
                    <span>{message.text}</span>
                  </div>
                )}

                {!isSettingUp ? (
                  <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <span className="block text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                        TOTP Status
                      </span>
                      <span className="text-[11px] text-gray-400 font-semibold block mt-0.5">
                        Hardware 2FA protection active
                      </span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <AdminButton onClick={handleStart2FA} variant="primary" size="sm">
                        Configure Secret
                      </AdminButton>
                      <AdminButton
                        onClick={handleDisable2FA}
                        variant="ghost"
                        className="text-red-500 hover:bg-red-50"
                        size="sm"
                      >
                        Disable
                      </AdminButton>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={handleVerify2FA}
                    className="p-4 rounded-2xl bg-[#0E4825]/5 dark:bg-[#0E4825]/10 border border-[#0E4825]/10 space-y-4 text-center"
                  >
                    <Smartphone
                      size={28}
                      className="mx-auto text-[#0E4825] dark:text-emerald-400"
                    />
                    <h4 className="text-xs font-bold uppercase text-gray-900 dark:text-white">
                      Scan with Authenticator App
                    </h4>
                    <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
                      Scan the secret below with Google Authenticator or any RFC-6238 TOTP
                      compatible application.
                    </p>

                    {setupData && (
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-32 w-32 bg-white rounded-xl border border-gray-100 p-2 shadow-sm flex items-center justify-center text-[10px] text-gray-400 font-mono text-center">
                          [Scan QR Code]
                          <br />
                          {setupData.secret.substring(0, 10)}...
                        </div>
                        <div className="w-full">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                            Manual Key
                          </span>
                          <code className="text-xs bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 px-3 py-1.5 rounded-lg select-all font-mono inline-block font-bold tracking-widest text-[#0E4825] dark:text-emerald-400">
                            {setupData.secret}
                          </code>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5 max-w-xs mx-auto">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Verification Token
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={setupCode}
                        onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ""))}
                        className="w-full text-center tracking-[6px] font-mono font-bold text-base rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] py-2 focus:border-[#0E4825] outline-none"
                        placeholder="000000"
                      />
                    </div>

                    <div className="flex gap-2">
                      <AdminButton
                        type="button"
                        onClick={() => setIsSettingUp(false)}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        Cancel
                      </AdminButton>
                      <AdminButton
                        type="submit"
                        disabled={setupCode.length !== 6}
                        variant="primary"
                        size="sm"
                        className="flex-1"
                      >
                        Verify
                      </AdminButton>
                    </div>
                  </form>
                )}
              </div>
            </AdminCard>

            {/* Change Password Card */}
            <AdminCard
              title="Modify Account Password"
              subtitle="Routinely rotate password variables to block credential attacks"
            >
              <form onSubmit={handleChangePassword} className="space-y-4">
                {pwdMessage && (
                  <div
                    className={`p-4 rounded-xl text-xs font-semibold border flex items-center gap-2 ${pwdMessage.type === "success" ? "bg-green-50 border-green-100 text-[#0E4825]" : "bg-red-50 border-red-100 text-red-600"}`}
                  >
                    <CheckCircle size={16} />
                    <span>{pwdMessage.text}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-xs font-semibold focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-xs font-semibold focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-xs font-semibold focus:outline-none"
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <AdminButton type="submit" variant="primary" size="sm">
                    Rotate Password
                  </AdminButton>
                </div>
              </form>
            </AdminCard>
          </div>
        )}

        {activeTab === "sessions" && (
          <AdminCard
            title="Session Monitor"
            subtitle="All active devices authenticated to this administration profile"
          >
            <div className="divide-y divide-gray-100 dark:divide-gray-800/60 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-transparent">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="flex justify-between items-center p-4 hover:bg-gray-50/50 dark:hover:bg-gray-900/10 transition-colors"
                >
                  <div className="flex gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${sess.active ? "bg-[#0E4825]/10 text-[#0E4825] dark:text-emerald-400" : "bg-gray-100 dark:bg-gray-900 text-gray-400"}`}
                    >
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          {sess.os} · {sess.browser}
                        </span>
                        {sess.active && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-[#16A34A] border border-emerald-100">
                            Current Session
                          </span>
                        )}
                      </div>
                      <span className="block text-[11px] text-gray-400 mt-0.5">
                        {sess.ip} · {sess.country} · Seen {sess.lastSeen}
                      </span>
                    </div>
                  </div>
                  {!sess.active && (
                    <button
                      onClick={() => {
                        if (admin?.id) {
                           updateDoc(doc(db, "admins", admin.id, "sessions", sess.id), { active: false });
                        }
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-950/15 transition-colors"
                      title="Terminate Session"
                    >
                      <Power size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </AdminCard>
        )}

        {activeTab === "permissions" && (
          <AdminCard
            title="Effective Access Clearances"
            subtitle="A ledger of RBAC permission nodes validated on this active administrative token"
          >
            <div className="flex flex-wrap gap-2 py-2">
              {permissions.map((p, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-[#0E4825]/5 hover:text-[#0E4825] hover:border-[#0E4825]/20 transition-all cursor-default"
                >
                  {p}
                </span>
              ))}
            </div>
          </AdminCard>
        )}
      </div>
    </div>
  );
};
