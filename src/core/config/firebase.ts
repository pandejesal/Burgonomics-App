import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAuoa6yU-S8bNR3QDI3DjTUvbKNyBu3_Fs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "burgonomics-7faa8.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "burgonomics-7faa8",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "burgonomics-7faa8.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "738930066637",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:738930066637:web:fc1aa0f0e2a52a19df9584",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-HQ218Q7CXF",
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
