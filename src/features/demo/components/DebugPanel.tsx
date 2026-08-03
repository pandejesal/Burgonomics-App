/**
 * Floating developer/QA panel.
 *
 * Renders only outside production. Provides live inspection of the
 * customer journey (user, store, cart, checkout, payment, backend
 * order, PETPOOJA order, SSE, recent API calls) and quick toggles for
 * simulation flags and forced failure paths.
 *
 * This component is UI-only — it reads from feature stores through
 * their public selectors and mutates ONLY the demo store. It never
 * bypasses a repository.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  useDemoStore,
  isDebugAllowed,
  type SimulatedFailure,
} from "@/features/demo/state/demoStore";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { useOrdersStore } from "@/features/orders/state/ordersStore";
import { appConfig } from "@/core/config/env";
import { PetpoojaTab } from "./PetpoojaTab";

const ERRORS: Array<{ id: SimulatedFailure; label: string }> = [
  { id: "payment", label: "Payment failure" },
  { id: "network_timeout", label: "Network timeout" },
  { id: "petpooja_down", label: "PETPOOJA unavailable" },
  { id: "stock_unavailable", label: "Stock unavailable" },
  { id: "coupon_invalid", label: "Coupon invalid" },
  { id: "order_rejected", label: "Order rejected" },
];

export function DebugPanel() {
  if (!isDebugAllowed()) return null;
  return <DebugPanelInner />;
}

function DebugPanelInner() {
  const open = useDemoStore((s) => s.debugPanelOpen);
  const toggle = useDemoStore((s) => s.toggleDebugPanel);
  const [tab, setTab] = useState<"state" | "razorpay" | "petpooja" | "errors" | "api">("state");

  const demo = useDemoStore();
  const user = useAuthStore((s) => s.user);
  const cartLines = useCartStore((s) => s.lines);
  const cartPromo = useCartStore((s) => s.promo);
  const cart = { lines: cartLines, promo: cartPromo };
  const sel = useStoreSelection();
  const checkout = useCheckoutStore();
  const activeOrderId = useOrdersStore((s) => s.activeOrderId);
  const orders = useOrdersStore((s) => s.byId);
  const activeOrder = activeOrderId ? orders[activeOrderId] : null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => toggle(true)}
        className="fixed bottom-24 right-4 z-[9999] rounded-full bg-black/80 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur"
        aria-label="Open debug panel"
      >
        ⚙︎ DEV
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-h-[70vh] w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-white/10 bg-black/90 text-white shadow-2xl backdrop-blur">
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-orange-500 px-1.5 py-0.5 font-bold">DEV</span>
          <span className="font-semibold">Debug Panel</span>
          <span className="text-white/50">{appConfig.env}</span>
        </div>
        <button onClick={() => toggle(false)} className="text-white/70 hover:text-white">
          ✕
        </button>
      </header>
      <nav className="flex gap-1 border-b border-white/10 px-2 py-1 text-xs overflow-x-auto scrollbar-none">
        {(["state", "razorpay", "petpooja", "errors", "api"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-2 py-1 capitalize shrink-0 ${tab === t ? "bg-white/15" : "text-white/60"}`}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="max-h-[54vh] overflow-y-auto px-3 py-2 text-[11px] leading-relaxed">
        {tab === "state" && (
          <div className="space-y-3">
            <div className="rounded-xl bg-[#0E4825]/20 border border-[#0E4825]/40 p-2.5 flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-emerald-400 text-xs">Admin Access Gateway</div>
                <div className="text-[10px] text-white/60">
                  Configure systems, sync menu catalogs, and manage orders
                </div>
              </div>
              <Link
                to="/admin"
                className="rounded-lg bg-[#0E4825] px-2.5 py-1.5 font-bold text-xs text-white hover:bg-[#0B3A1D] transition-all shrink-0 shadow-sm border border-white/10"
              >
                Go to Admin
              </Link>
            </div>
            <Row label="Simulation mode">
              <Toggle value={demo.simulationMode} onChange={demo.setSimulationMode} />
            </Row>
            <Row label="PETPOOJA simulate success">
              <Toggle value={demo.petpoojaSimulateSuccess} onChange={demo.setPetpoojaSimulate} />
            </Row>
            <Section title="User">
              {user ? `${user.name ?? "—"} · ${user.phone ?? "—"}` : "signed out"}
            </Section>
            <Section title="Store">
              {sel.activeStore
                ? `${sel.activeStore.name} · ${sel.fulfillment ?? "—"}`
                : "no store selected"}
            </Section>
            <Section title={`Cart (${cart.lines.length} lines)`}>
              <pre className="max-h-32 overflow-auto rounded bg-white/5 p-2 text-[10px]">
                {JSON.stringify({ lines: cart.lines, promo: cart.promo }, null, 2)}
              </pre>
            </Section>
            <Section title="Checkout">
              <pre className="max-h-24 overflow-auto rounded bg-white/5 p-2 text-[10px]">
                {JSON.stringify(
                  {
                    deliveryInstructions: checkout.deliveryInstructions,
                    pickupInstructions: checkout.pickupInstructions,
                    diningNotes: checkout.diningNotes,
                    orderNotes: checkout.orderNotes,
                  },
                  null,
                  2,
                )}
              </pre>
            </Section>
            <Section title="Payment / Order IDs">
              <ul className="space-y-0.5">
                <li>
                  rzp_order:{" "}
                  <code className="text-orange-300">{demo.lastRazorpayOrderId ?? "—"}</code>
                </li>
                <li>
                  payment: <code className="text-orange-300">{demo.lastPaymentId ?? "—"}</code>
                </li>
                <li>
                  backend: <code className="text-orange-300">{demo.lastBackendOrderId ?? "—"}</code>
                </li>
                <li>
                  petpooja:{" "}
                  <code className="text-orange-300">{demo.lastPetpoojaOrderId ?? "—"}</code>
                </li>
              </ul>
            </Section>
            <Section title="Active order">
              {activeOrder ? `${activeOrder.shortCode} · ${activeOrder.status.label}` : "none"}
            </Section>
            <Section title="Env">
              <ul className="space-y-0.5">
                <li>
                  API: <code>{appConfig.api.baseUrl}</code>
                </li>
                <li>
                  Razorpay key:{" "}
                  <code>{appConfig.integrations.razorpayKeyId || "(placeholder)"}</code>
                </li>
                <li>
                  PETPOOJA flag: <code>{String(appConfig.integrations.petpoojaEnabled)}</code>
                </li>
              </ul>
            </Section>
          </div>
        )}

        {tab === "razorpay" && <RazorpayTab />}

        {tab === "petpooja" && <PetpoojaTab />}

        {tab === "errors" && (
          <div className="space-y-2">
            <p className="text-white/60">Force specific failure paths for QA. Dev-only.</p>
            {ERRORS.map((e) => (
              <Row key={e.id} label={e.label}>
                <Toggle value={demo.errorSims[e.id]} onChange={(v) => demo.setError(e.id, v)} />
              </Row>
            ))}
            <button
              onClick={demo.clearErrors}
              className="mt-2 w-full rounded-md bg-white/10 py-1.5 text-xs hover:bg-white/20"
            >
              Clear all
            </button>
          </div>
        )}

        {tab === "api" && (
          <div className="space-y-1">
            {demo.recentApiCalls.length === 0 ? (
              <p className="text-white/50">No API calls recorded yet.</p>
            ) : (
              demo.recentApiCalls.map((c) => (
                <div key={c.id} className="rounded bg-white/5 px-2 py-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono">{c.label}</span>
                    <span className={c.status === "ok" ? "text-emerald-400" : "text-red-400"}>
                      {c.status} · {c.ms}ms
                    </span>
                  </div>
                  {c.meta && (
                    <pre className="mt-1 max-h-16 overflow-auto text-[10px] text-white/60">
                      {JSON.stringify(c.meta, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">{title}</div>
      <div className="text-white/90">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded bg-white/5 px-2 py-1.5">
      <span>{label}</span>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative h-5 w-9 rounded-full transition ${value ? "bg-orange-500" : "bg-white/20"}`}
      aria-pressed={value}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${value ? "left-4" : "left-0.5"}`}
      />
    </button>
  );
}

function RazorpayTab() {
  const rzp = useDemoStore((s) => s.razorpay);
  const keyId = appConfig.integrations.razorpayKeyId;
  const backendBase = appConfig.integrations.paymentsApiBaseUrl;
  const health = !keyId
    ? { label: "Missing Key", tone: "text-amber-300" }
    : rzp.lastError
      ? { label: "Configuration Error", tone: "text-red-400" }
      : rzp.mode === "live_test"
        ? {
            label: rzp.sdkLoaded ? "Connected" : "Loading SDK…",
            tone: rzp.sdkLoaded ? "text-emerald-400" : "text-white/70",
          }
        : { label: "Simulation Mode", tone: "text-amber-300" };
  const maskedKey = keyId ? `${keyId.slice(0, 8)}…${keyId.slice(-4)}` : "(not set)";

  return (
    <div className="space-y-2">
      <Section title="Health">
        <span className={health.tone}>{health.label}</span>
      </Section>
      <ul className="space-y-0.5 rounded bg-white/5 p-2">
        <li>
          Environment: <code>{rzp.mode}</code>
        </li>
        <li>
          Key loaded: <Bool v={rzp.keyLoaded} />
        </li>
        <li>
          Key (VITE_RAZORPAY_KEY_ID): <code>{maskedKey}</code>
        </li>
        <li>
          SDK loaded: <Bool v={rzp.sdkLoaded} />
        </li>
        <li>
          Backend URL: <code>{backendBase || "(none — simulation)"}</code>
        </li>
        <li>
          Backend connected: <Bool v={rzp.backendConnected} />
        </li>
      </ul>
      <ul className="space-y-0.5 rounded bg-white/5 p-2">
        <li>
          Last order id: <code className="text-orange-300">{rzp.lastOrderId ?? "—"}</code>
        </li>
        <li>
          Last payment id: <code className="text-orange-300">{rzp.lastPaymentId ?? "—"}</code>
        </li>
        <li>
          Verification: <code>{rzp.verifyStatus}</code>
        </li>
        <li>
          Payment status: <code>{rzp.paymentStatus}</code>
        </li>
        <li>
          Latency: <code>{rzp.lastLatencyMs != null ? `${rzp.lastLatencyMs}ms` : "—"}</code>
        </li>
      </ul>
      {rzp.lastError && (
        <div className="rounded bg-red-500/10 p-2 text-red-300">
          <div className="text-[10px] uppercase tracking-wider">Last error</div>
          <div>
            <code>{rzp.lastError.code}</code> — {rzp.lastError.message}
          </div>
          <div className="text-[10px] text-white/50">{rzp.lastError.at}</div>
        </div>
      )}
      {!keyId && (
        <p className="text-[10px] text-white/60">
          Set <code>VITE_RAZORPAY_KEY_ID</code> (and optionally{" "}
          <code>VITE_PAYMENTS_API_BASE_URL</code>) to enable the real Razorpay test checkout.
        </p>
      )}
    </div>
  );
}

function Bool({ v }: { v: boolean }) {
  return <span className={v ? "text-emerald-400" : "text-white/50"}>{v ? "yes" : "no"}</span>;
}
