import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
 * True when every Firebase env key is present. Exported so call sites can
 * degrade gracefully instead of crashing.
 */
export const isFirebaseConfigured = missingFirebaseKeys.length === 0;

if (!isFirebaseConfigured) {
  if (import.meta.env.PROD === true) {
    // Fail fast in production: booting with placeholder credentials would
    // surface opaque use-time errors instead of the real misconfiguration.
    // Naming the missing keys makes the failure actionable.
    throw new Error(
      `[Firebase] Missing required environment variables: ${missingFirebaseKeys.join(", ")}. ` +
        `Set these in the production environment before initializing Firebase.`,
    );
  }
  // Local development only: warn and initialize with placeholder values so the
  // app still boots without real credentials. Firebase-backed calls fail at
  // use-time instead of killing the dev server.
  console.warn(
    `[Firebase] Missing environment variables: ${missingFirebaseKeys.join(", ")}. ` +
      `Firebase initialized with placeholder config; Firebase-backed features will fail at use-time.`,
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "missing-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "missing-auth-domain",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "missing-project-id",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "missing-storage-bucket",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "missing-sender-id",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "missing-app-id",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

let appCheckInstance: import("firebase/app-check").AppCheck | null = null;
let appCheckInitStarted = false;

/**
 * Initializes Firebase App Check (reCAPTCHA v3, web only). No-ops on native
 * shells (Play Integrity needs a native plugin — documented gap), without a
 * site key, or when already initialized. Safe to call at boot.
 */
export async function initAppCheck(): Promise<void> {
  if (appCheckInitStarted || typeof window === "undefined") return;
  appCheckInitStarted = true;
  try {
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
    if (!siteKey) return;
    if (typeof (window as any).Capacitor !== "undefined") return;
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
  if (!appCheckInstance) return null;
  try {
    const { getToken } = await import("firebase/app-check");
    const res = await getToken(appCheckInstance, false);
    return res.token;
  } catch {
    return null;
  }
}
