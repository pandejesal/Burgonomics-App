/**
 * Honesty gates for the core-app P1 sweep:
 *  - P1-4: profile hydration never fabricates email / membership tier /
 *    join date; completion counts a synthetic or absent email as missing;
 *    the v1→v2 persist migrate strips cached fabricated values only.
 *  - P1-9: the consent banner's X is a session-only hide (never writes
 *    `burg.dpdp_consent_granted`); only "Accept & Continue" records consent;
 *    the banner sits above the floating cart bar (z-[60] + bottom-36).
 *  - P1-11: analytics / personalised-ads consent flags default to false.
 *
 * This suite runs in vitest's node environment with relative `../src/...`
 * imports (no `@/` alias here), so browser storage is stubbed onto
 * globalThis.window where a test needs it. `grantConsent` /
 * `dismissForSession` are the exact handlers wired to the banner's
 * "Accept & Continue" button and X button respectively.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The banner renders outside a <RouterProvider> in this node-env suite;
// TanStack's Link dereferences the router, so stub it with a plain anchor.
vi.mock("@tanstack/react-router", () => ({
  Link: (props: { to: string; className?: string; children?: unknown }) => (
    <a href={String(props.to)} className={props.className}>
      {props.children as never}
    </a>
  ),
}));

import {
  useProfileStore,
  computeCompletion,
  isSyntheticEmail,
  migrateProfilePersistedState,
} from "../src/features/profile/state/profileStore";
import { useSettingsStore } from "../src/features/settings/state/settingsStore";
import {
  ConsentBanner,
  CONSENT_KEY,
  CONSENT_DISMISS_KEY,
  grantConsent,
  dismissForSession,
  hasGrantedConsent,
} from "../src/shared/components/common/ConsentBanner";

function installFakeWindow() {
  const localMap = new Map<string, string>();
  const sessionMap = new Map<string, string>();
  const makeStorage = (map: Map<string, string>) => ({
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  });
  (globalThis as { window?: unknown }).window = {
    localStorage: makeStorage(localMap),
    sessionStorage: makeStorage(sessionMap),
  };
  return { localMap, sessionMap };
}

function uninstallFakeWindow() {
  delete (globalThis as { window?: unknown }).window;
}

describe("P1-4: profile hydration emits no fabricated account facts", () => {
  beforeEach(() => {
    useProfileStore.getState().clear();
  });

  it("seeds a fresh session without email, membershipTier or createdAt", () => {
    useProfileStore.getState().hydrateFromAuth({
      id: "usr_1",
      phone: "9876543210",
      name: "Ravi",
    });
    const p = useProfileStore.getState().profile!;
    expect(p.id).toBe("usr_1");
    expect(p.phone).toBe("9876543210");
    expect(p.fullName).toBe("Ravi");
    expect("email" in p).toBe(false);
    expect("membershipTier" in p).toBe(false);
    expect("createdAt" in p).toBe(false);
    expect(JSON.stringify(p)).not.toContain("burgonomics.in");
    expect(JSON.stringify(p)).not.toContain("silver");
  });

  it("fills a missing name on an existing profile without inventing an email", () => {
    useProfileStore.setState({ profile: { id: "usr_2", phone: "9123456780", fullName: "" } });
    useProfileStore.getState().hydrateFromAuth({ id: "usr_2", phone: "9123456780", name: "Priya" });
    const p = useProfileStore.getState().profile!;
    expect(p.fullName).toBe("Priya");
    expect("email" in p).toBe(false);
    expect("membershipTier" in p).toBe(false);
    expect("createdAt" in p).toBe(false);
  });

  it("isSyntheticEmail flags only the 10-digit phone @burgonomics.in pattern", () => {
    expect(isSyntheticEmail("9876543210@burgonomics.in")).toBe(true);
    expect(isSyntheticEmail("ravi@example.com")).toBe(false);
    expect(isSyntheticEmail("98765@burgonomics.in")).toBe(false);
    expect(isSyntheticEmail(null)).toBe(false);
    expect(isSyntheticEmail(undefined)).toBe(false);
  });
});

describe("P1-4: completion counts synthetic/absent email as missing", () => {
  const base = {
    id: "usr_3",
    phone: "9876543210",
    fullName: "Rohan Varma",
    dateOfBirth: "1995-01-01",
    gender: "male" as const,
  };

  it("synthetic email scores 4/5 (80%), not 5/5", () => {
    const result = computeCompletion({ ...base, email: "9876543210@burgonomics.in" });
    expect(result.percent).toBe(80);
    expect(result.missing).toContain("Email");
  });

  it("absent email scores 4/5 (80%)", () => {
    const result = computeCompletion({ ...base });
    expect(result.percent).toBe(80);
    expect(result.missing).toContain("Email");
  });

  it("a real email completes the profile (5/5)", () => {
    const result = computeCompletion({ ...base, email: "rohan@example.com" });
    expect(result.percent).toBe(100);
    expect(result.missing).toHaveLength(0);
  });
});

describe("P1-4: v1→v2 persist migrate strips cached fabricated values", () => {
  it("persist is bumped to version 2 with a migrate function wired", () => {
    const options = useProfileStore.persist.getOptions() as { version?: number; migrate?: unknown };
    expect(options.version).toBe(2);
    expect(typeof options.migrate).toBe("function");
  });

  it("strips synthetic email, silver tier and same-day createdAt, keeps everything else", () => {
    const cached = {
      profile: {
        id: "usr_4",
        phone: "9876543210",
        fullName: "Kiran Shah",
        email: "9876543210@burgonomics.in",
        membershipTier: "silver",
        createdAt: new Date().toISOString(),
        dateOfBirth: "1990-05-05",
        gender: "female" as const,
        photoUrl: "https://example.com/avatar.png",
      },
    };
    const migrated = migrateProfilePersistedState(cached);
    const p = migrated.profile!;
    expect("email" in p).toBe(false);
    expect("membershipTier" in p).toBe(false);
    expect("createdAt" in p).toBe(false);
    expect(p).toMatchObject({
      id: "usr_4",
      phone: "9876543210",
      fullName: "Kiran Shah",
      dateOfBirth: "1990-05-05",
      gender: "female",
      photoUrl: "https://example.com/avatar.png",
    });
  });

  it("leaves a real profile untouched (real email, non-silver tier, older join date)", () => {
    const cached = {
      profile: {
        id: "usr_5",
        phone: "9876543210",
        fullName: "Meera Iyer",
        email: "meera@example.com",
        membershipTier: "gold",
        createdAt: "2025-11-02T10:00:00.000Z",
      },
    };
    expect(migrateProfilePersistedState(cached)).toEqual(cached);
  });

  it("tolerates a missing or empty cached state", () => {
    expect(migrateProfilePersistedState(undefined)).toEqual({ profile: null });
    expect(migrateProfilePersistedState({})).toEqual({ profile: null });
  });
});

describe("P1-4: rehydrating a real v1 cache applies the migration end-to-end", () => {
  let fake: ReturnType<typeof installFakeWindow>;

  beforeEach(() => {
    fake = installFakeWindow();
  });

  afterEach(() => {
    uninstallFakeWindow();
    vi.resetModules();
  });

  it("strips fabricated values from storage and rewrites the cache as version 2", async () => {
    fake.localMap.set(
      "burg.profile",
      JSON.stringify({
        state: {
          profile: {
            id: "usr_6",
            phone: "9876543210",
            fullName: "Ravi Patel",
            email: "9876543210@burgonomics.in",
            membershipTier: "silver",
            createdAt: new Date().toISOString(),
            dateOfBirth: "1992-04-04",
          },
        },
        version: 1,
      }),
    );

    vi.resetModules();
    const mod = await import("../src/features/profile/state/profileStore");
    const p = mod.useProfileStore.getState().profile!;

    expect(p).toBeTruthy();
    expect("email" in p).toBe(false);
    expect("membershipTier" in p).toBe(false);
    expect("createdAt" in p).toBe(false);
    expect(p.dateOfBirth).toBe("1992-04-04");
    expect(p.fullName).toBe("Ravi Patel");

    const written = JSON.parse(fake.localMap.get("burg.profile")!) as {
      version: number;
      state: { profile: Record<string, unknown> };
    };
    expect(written.version).toBe(2);
    expect("email" in written.state.profile).toBe(false);
    expect("membershipTier" in written.state.profile).toBe(false);
  });
});

describe("P1-11: consent toggles default to false", () => {
  it("analyticsOptIn and personalizedAdsOptIn start off", () => {
    const s = useSettingsStore.getState();
    expect(s.analyticsOptIn).toBe(false);
    expect(s.personalizedAdsOptIn).toBe(false);
  });

  it("reset() returns both flags to false", () => {
    useSettingsStore.getState().update({ analyticsOptIn: true, personalizedAdsOptIn: true });
    useSettingsStore.getState().reset();
    expect(useSettingsStore.getState().analyticsOptIn).toBe(false);
    expect(useSettingsStore.getState().personalizedAdsOptIn).toBe(false);
  });
});

describe("P1-9: consent banner — X hides for session only, Accept records consent", () => {
  let fake: ReturnType<typeof installFakeWindow>;

  beforeEach(() => {
    fake = installFakeWindow();
  });

  afterEach(() => {
    uninstallFakeWindow();
  });

  it("X (dismissForSession) never writes the localStorage consent key", () => {
    dismissForSession();
    expect(fake.localMap.has(CONSENT_KEY)).toBe(false);
    expect(window.localStorage.getItem(CONSENT_KEY)).toBeNull();
    expect(fake.sessionMap.get(CONSENT_DISMISS_KEY)).toBe("true");
    expect(hasGrantedConsent()).toBe(false);
  });

  it("Accept (grantConsent) writes affirmative consent to localStorage", () => {
    grantConsent();
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe("true");
    expect(hasGrantedConsent()).toBe(true);
  });

  it("renders above the floating cart bar (z-[60] + bottom-36) when no consent/dismissal", () => {
    const html = renderToStaticMarkup(<ConsentBanner />);
    expect(html).toContain("z-[60]");
    expect(html).toContain("bottom-36");
    expect(html).toContain("Your Privacy Matters");
    expect(html).toContain("Accept &amp; Continue");
  });

  it("hides for the rest of the session after X, and returns in a new session", () => {
    dismissForSession();
    expect(renderToStaticMarkup(<ConsentBanner />)).toBe("");

    // New browser session: sessionStorage cleared, consent still unset.
    fake.sessionMap.clear();
    expect(renderToStaticMarkup(<ConsentBanner />)).toContain("Your Privacy Matters");
  });

  it("stays hidden for every later session once Accept recorded consent", () => {
    grantConsent();
    fake.sessionMap.clear();
    expect(renderToStaticMarkup(<ConsentBanner />)).toBe("");
  });
});
