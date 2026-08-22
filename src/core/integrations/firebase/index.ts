/**
 * Firebase integration adapter (contract only).
 *
 * Auth, push (FCM), Remote Config, and Crashlytics wire into this
 * interface. No SDK is imported directly here.
 */
export interface FirebaseAuthResult {
  uid: string;
  idToken: string;
  refreshToken: string;
}

export interface FirebasePushToken {
  token: string;
  platform: "web" | "ios" | "android";
}

export interface FirebaseAdapter {
  readonly name: "firebase";
  init(): Promise<void>;
  requestPushPermission(): Promise<PermissionState>;
  getPushToken(): Promise<FirebasePushToken | null>;
  recordError(error: unknown, context?: Record<string, unknown>): void;
}

export const firebaseAdapter: FirebaseAdapter = {
  name: "firebase",
  async init() {
    /* no-op */
  },
  async requestPushPermission() {
    return "prompt" as PermissionState;
  },
  async getPushToken() {
    return null;
  },
  recordError() {
    /* forwarded to logger in real impl */
  },
};
