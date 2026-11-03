import { Capacitor } from "@capacitor/core";
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { initializeFirestore, type FirestoreSettings } from "firebase/firestore";

const requiredFirebaseKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const missingFirebaseKeys = requiredFirebaseKeys.filter((key) => !import.meta.env[key]);

/**
 * True when every Firebase env key is present. Exported for boot diagnostics;
 * this module throws below when it is false, so no call site can ever observe
 * a Firebase instance built from incomplete configuration.
 */
export const isFirebaseConfigured = missingFirebaseKeys.length === 0;

/**
 * Thrown at module load when any required VITE_FIREBASE_* key is absent.
 * Typed so boot diagnostics (mobile-entry.tsx ConfigErrorScreen) can identify
 * the misconfiguration precisely while `missingKeys` names exactly which
 * variables must be set.
 */
export class FirebaseConfigMissingKeysError extends Error {
  readonly missingKeys: readonly string[];

  constructor(missingKeys: readonly string[]) {
    super(
      `[Firebase] Missing required environment variables: ${missingKeys.join(", ")}. ` +
        `Set these before initializing Firebase (see .env.example for the full list).`,
    );
    this.name = "FirebaseConfigMissingKeysError";
    this.missingKeys = missingKeys;
  }
}

if (!isFirebaseConfigured) {
  // Fail fast in every environment — there is no safe placeholder credential.
  // A production build must never boot against a fake project, and a dev boot
  // with fake keys would only move the failure to an opaque use-time error
  // (getAuth rejects a missing api key). mobile-entry.tsx catches this typed
  // FirebaseConfigMissingKeysError and renders ConfigErrorScreen with the
  // message instead of a blank page, and naming the missing keys makes the
  // misconfiguration actionable.
  throw new FirebaseConfigMissingKeysError(missingFirebaseKeys);
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
// getAuth() installs the browser popup/redirect resolver, and Auth's start-up
// then waits on an authDomain iframe that never answers inside the iOS
// WKWebView (capacitor://): onAuthStateChanged never fired and the app sat on
// its spinner. Phone sign-in needs no resolver, so native shells drop it and
// keep the persistence order getAuth() uses, which preserves existing sessions.
const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    })
  : getAuth(app);
/**
 * CUS-06: orders carry optional leaves that are legitimately `undefined`
 * (notes, fulfillmentInstructions, tableNumber, payment.transactionId,
 * payment.paidAt, branchCoordinates — see ordersService.createOrder). With
 * plain `getFirestore()` the SDK validates the write locally and throws
 * `invalid-argument` "Unsupported field value: undefined" BEFORE any request,
 * so every checkout surfaced PERSIST_FAILED and Razorpay never opened.
 * `ignoreUndefinedProperties` drops those keys instead. Exported so the
 * regression test (src/features/orders/order-persist-firestore.test.ts) builds
 * a real Firestore instance with the identical settings.
 */
export const firestoreSettings: FirestoreSettings = { ignoreUndefinedProperties: true };

const db = initializeFirestore(app, firestoreSettings);

export { app, auth, db };

let appCheckInstance: import("firebase/app-check").AppCheck | null = null;
let appCheckInitStarted = false;
let nativeAppCheckReady = false;

/**
 * Initializes Firebase App Check on every platform. Web uses reCAPTCHA v3
 * (needs VITE_RECAPTCHA_SITE_KEY). Native shells (Capacitor) use Play
 * Integrity on Android / App Attest on iOS via @capacitor-firebase/app-check
 * (needs `npx cap sync` after install + Firebase-console app registration —
 * see PRODUCTION_RUNBOOK). No-ops without a site key (web), when already
 * initialized, or when the native plugin is missing (graceful null tokens —
 * server runs monitor mode until enforced). Safe to call at boot.
 */
export async function initAppCheck(): Promise<void> {
  if (appCheckInitStarted || typeof window === "undefined") return;
  appCheckInitStarted = true;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      try {
        const { FirebaseAppCheck } = await import("@capacitor-firebase/app-check");
        await FirebaseAppCheck.initialize();
        await FirebaseAppCheck.setTokenAutoRefreshEnabled({ enabled: true });
        nativeAppCheckReady = true;
      } catch {
        // Native plugin not synced/registered — tokens stay null until the
        // next `npx cap sync` + console enrollment. Never throws at boot.
      }
      return;
    }
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
    if (!siteKey) return;
    const { initializeAppCheck, ReCaptchaV3Provider } = await import("firebase/app-check");
    if (window.location.hostname === "localhost") {
      (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // Attestation unavailable — server runs monitor mode until enforced.
  }
}

/** Current App Check token for the X-Firebase-AppCheck header, or null when uninitialized. */
export async function getAppCheckToken(): Promise<string | null> {
  if (nativeAppCheckReady) {
    try {
      const { FirebaseAppCheck } = await import("@capacitor-firebase/app-check");
      const { token } = await FirebaseAppCheck.getToken({ forceRefresh: false });
      return token || null;
    } catch {
      return null;
    }
  }
  if (!appCheckInstance) return null;
  try {
    const { getToken } = await import("firebase/app-check");
    const res = await getToken(appCheckInstance, false);
    return res.token;
  } catch {
    return null;
  }
}
