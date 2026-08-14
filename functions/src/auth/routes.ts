import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as express from "express";
import {
  getSMSProvider,
  sendOtpWithFallback,
  hashOtp,
} from "./smsProvider";

function getDb(): admin.firestore.Firestore {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
  return admin.firestore();
}

function getAuth(): admin.auth.Auth {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
  return admin.auth();
}

// SEC-8 CORS Allowlist Standard
const ALLOWED_ORIGINS = new Set([
  "https://burgonomics.com",
  "http://localhost:8080",
  "https://localhost:8080",
  "capacitor://localhost",
  "https://localhost",
]);

/**
 * Shared CORS Middleware (SEC-8 standard).
 * Echos origin only if in allowlist; sets no CORS header otherwise.
 */
export function applyCors(req: express.Request, res: express.Response, next?: express.NextFunction): boolean {
  const origin = req.headers.origin;
  if (typeof origin === "string" && ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Credentials", "false");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }

  if (next) {
    next();
  }
  return false;
}

/**
 * Bridge Firebase Functions configuration into process.env at request time.
 */
function bridgeFunctionsConfig(): void {
  try {
    const config = functions.config();
    if (config?.sms) {
      if (config.sms.provider && !process.env.SMS_PROVIDER) {
        process.env.SMS_PROVIDER = config.sms.provider;
      }
      if (config.sms.msg91_authkey && !process.env.MSG91_API_KEY) {
        process.env.MSG91_API_KEY = config.sms.msg91_authkey;
      }
      if (config.sms.msg91_template_id && !process.env.MSG91_TEMPLATE_ID) {
        process.env.MSG91_TEMPLATE_ID = config.sms.msg91_template_id;
      }
      if (config.sms.msg91_sender_id && !process.env.MSG91_SENDER_ID) {
        process.env.MSG91_SENDER_ID = config.sms.msg91_sender_id;
      }
      if (config.sms.fast2sms_api_key && !process.env.FAST2SMS_API_KEY) {
        process.env.FAST2SMS_API_KEY = config.sms.fast2sms_api_key;
      }
      if (config.sms.twilio_account_sid && !process.env.TWILIO_ACCOUNT_SID) {
        process.env.TWILIO_ACCOUNT_SID = config.sms.twilio_account_sid;
      }
      if (config.sms.twilio_auth_token && !process.env.TWILIO_AUTH_TOKEN) {
        process.env.TWILIO_AUTH_TOKEN = config.sms.twilio_auth_token;
      }
      if (config.sms.twilio_from_number && !process.env.TWILIO_FROM_NUMBER) {
        process.env.TWILIO_FROM_NUMBER = config.sms.twilio_from_number;
      }
    }
  } catch (_err) {
    // Ignore when functions.config() is not available in local testing
  }
}

/**
 * Normalizes input to E.164 +91XXXXXXXXXX format.
 */
export function normalizeIndianPhone(rawPhone: string): string | null {
  if (!rawPhone || typeof rawPhone !== "string") return null;
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 10) {
    // Standard 10-digit Indian number (starts with 6-9)
    if (/^[6-9]\d{9}$/.test(digits)) {
      return `+91${digits}`;
    }
    return null;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    const local = digits.substring(2);
    if (/^[6-9]\d{9}$/.test(local)) {
      return `+91${local}`;
    }
    return null;
  }
  return null;
}

/**
 * Handler for Requesting OTP
 * POST /auth/request-otp { phone, deliveryMethod? }
 */
export async function handleRequestOtp(req: express.Request, res: express.Response): Promise<void> {
  if (applyCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ status: "error", message: "Method Not Allowed" });
    return;
  }

  bridgeFunctionsConfig();

  try {
    const { phone: rawPhone, deliveryMethod = "sms" } = req.body || {};
    const normalizedPhone = normalizeIndianPhone(rawPhone);

    if (!normalizedPhone) {
      res.status(400).json({
        status: "error",
        error: "INVALID_PHONE",
        message: "Please enter a valid 10-digit Indian mobile number.",
      });
      return;
    }

    const db = getDb();
    const now = Date.now();

    // 1. IP Rate Limiting: Max 20 requests per 10 minutes per IP (Hashed IP storage)
    const rawIp = (
      req.ip ||
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      "127.0.0.1"
    ).trim();
    const ipHash = crypto.createHash("sha256").update(rawIp).digest("hex");
    const ipRateLimitRef = db.collection("otp_rate_limits").doc(ipHash);
    const ipSnap = await ipRateLimitRef.get();
    const ipData = ipSnap.exists ? ipSnap.data() : null;
    const tenMinutesMs = 10 * 60 * 1000;

    let ipCount = ipData?.count || 0;
    const windowStartAt = ipData?.windowStartAt || now;

    if (now - windowStartAt > tenMinutesMs) {
      ipCount = 0; // Reset after 10m window
    }

    if (ipCount >= 20) {
      res.status(429).json({
        status: "error",
        error: "IP_RATE_LIMITED",
        message: "Too many OTP requests from this network. Please wait a few minutes.",
      });
      return;
    }

    await ipRateLimitRef.set({
      count: ipCount + 1,
      windowStartAt: ipCount === 0 ? now : windowStartAt,
      expiresAt: now + tenMinutesMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Phone Rate Limiting: 60-second cooldown per phone
    const otpDocRef = db.collection("otp_codes").doc(normalizedPhone);
    const otpSnap = await otpDocRef.get();
    const existingData = otpSnap.exists ? otpSnap.data() : null;

    if (existingData?.lastRequestedAt) {
      const elapsedSec = (now - existingData.lastRequestedAt) / 1000;
      if (elapsedSec < 60) {
        const remainingCooldown = Math.ceil(60 - elapsedSec);
        res.status(429).json({
          status: "error",
          error: "RATE_LIMITED",
          message: `Please wait ${remainingCooldown}s before requesting a new OTP.`,
          resendAfterSec: remainingCooldown,
        });
        return;
      }
    }

    // 3. Daily Rate Limiting: Max 5 requests per 24 hours per phone
    const oneDayMs = 24 * 60 * 60 * 1000;
    let dailyCount = existingData?.dailyCount || 0;
    const firstRequestAt = existingData?.firstRequestAt || now;

    if (now - firstRequestAt > oneDayMs) {
      dailyCount = 0; // Reset after 24h window
    }

    if (dailyCount >= 5) {
      res.status(429).json({
        status: "error",
        error: "DAILY_LIMIT_EXCEEDED",
        message: "Maximum daily OTP limit reached (5 requests/day). Please try again tomorrow.",
      });
      return;
    }

    // 4. Generate Cryptographically Secure 6-Digit OTP
    const code = crypto.randomInt(100000, 999999).toString();
    const salt = crypto.randomBytes(16).toString("hex");
    const hashedCode = hashOtp(code, salt);
    const expiresInSec = 300; // 5 minutes

    // 5. Save Hash + Expiry in Firestore (NEVER plain OTP)
    await otpDocRef.set({
      hashedCode,
      salt,
      attempts: 0,
      expiresAt: now + expiresInSec * 1000,
      lastRequestedAt: now,
      firstRequestAt: dailyCount === 0 ? now : firstRequestAt,
      dailyCount: dailyCount + 1,
      phone: normalizedPhone,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 6. Test Mode vs Production Dispatch
    const isTestMode =
      process.env.OTP_TEST_MODE === "1" ||
      process.env.SMS_PROVIDER === "test" ||
      (!getSMSProvider() && !process.env.MSG91_API_KEY && !process.env.FAST2SMS_API_KEY && !process.env.TWILIO_ACCOUNT_SID);

    if (isTestMode) {
      functions.logger.info(`[AUTH OTP TEST MODE] Phone: ${normalizedPhone} → OTP Code: ${code}`);
      res.status(200).json({
        otpToken: normalizedPhone,
        deliveryMethod: "sms",
        resendAfterSec: 60,
        expiresInSec,
        code,
        simulated: true,
      });
      return;
    }

    // 7. Production Dispatch via Provider Fallback Engine
    const dispatchResult = await sendOtpWithFallback(normalizedPhone, code, deliveryMethod === "whatsapp" ? "whatsapp" : "sms");
    if (!dispatchResult.success) {
      functions.logger.error(`[AUTH OTP] Failed to send OTP via ${dispatchResult.providerUsed}`, dispatchResult.errorLogs);
      res.status(500).json({
        status: "error",
        error: "SMS_DELIVERY_FAILED",
        message: "Failed to dispatch verification SMS. Please try again later.",
      });
      return;
    }

    // Production Response: NEVER include plain code
    res.status(200).json({
      otpToken: normalizedPhone,
      deliveryMethod: "sms",
      resendAfterSec: 60,
      expiresInSec,
    });
  } catch (err: any) {
    functions.logger.error("Error in handleRequestOtp:", err);
    res.status(500).json({
      status: "error",
      error: "INTERNAL_ERROR",
      message: err.message || "Failed to process OTP request.",
    });
  }
}

/**
 * Handler for Verifying OTP
 * POST /auth/verify-otp { phone, code }
 */
export async function handleVerifyOtp(req: express.Request, res: express.Response): Promise<void> {
  if (applyCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ status: "error", message: "Method Not Allowed" });
    return;
  }

  try {
    const { phone: rawPhone, otpToken, code } = req.body || {};
    const normalizedPhone = normalizeIndianPhone(rawPhone || otpToken);

    if (!normalizedPhone || !code || typeof code !== "string") {
      res.status(400).json({
        status: "error",
        error: "INVALID_ARGUMENTS",
        message: "Mobile number and 6-digit verification code are required.",
      });
      return;
    }

    const db = getDb();
    const auth = getAuth();
    const otpDocRef = db.collection("otp_codes").doc(normalizedPhone);
    const otpSnap = await otpDocRef.get();

    if (!otpSnap.exists) {
      res.status(400).json({
        status: "error",
        error: "OTP_NOT_FOUND",
        message: "Verification code expired or not found. Please request a new OTP.",
      });
      return;
    }

    const otpData = otpSnap.data()!;
    const now = Date.now();

    // 1. Expiration check
    if (now > otpData.expiresAt) {
      await otpDocRef.delete();
      res.status(400).json({
        status: "error",
        error: "OTP_EXPIRED",
        message: "Verification code has expired. Please request a new OTP.",
      });
      return;
    }

    // 2. Maximum attempts check (Max 3 failed attempts)
    const attempts = otpData.attempts || 0;
    if (attempts >= 3) {
      await otpDocRef.delete();
      res.status(400).json({
        status: "error",
        error: "MAX_ATTEMPTS_EXCEEDED",
        message: "Too many incorrect attempts. For security, this OTP is invalidated. Please request a new one.",
      });
      return;
    }

    // 3. Constant-Time Hash Comparison
    const computedHash = hashOtp(code.trim(), otpData.salt);
    const expectedHash = otpData.hashedCode;

    const isMatch =
      expectedHash.length === computedHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedHash, "utf8"),
        Buffer.from(computedHash, "utf8")
      );

    if (!isMatch) {
      const nextAttempts = attempts + 1;
      if (nextAttempts >= 3) {
        await otpDocRef.delete();
        res.status(400).json({
          status: "error",
          error: "MAX_ATTEMPTS_EXCEEDED",
          message: "Too many incorrect attempts. Please request a new OTP.",
          attemptsRemaining: 0,
        });
        return;
      }

      await otpDocRef.update({ attempts: nextAttempts });
      res.status(400).json({
        status: "error",
        error: "INCORRECT_CODE",
        message: `Incorrect verification code. ${3 - nextAttempts} attempt(s) remaining.`,
        attemptsRemaining: 3 - nextAttempts,
      });
      return;
    }

    // 4. Code verified successfully -> Invalidate OTP record immediately
    await otpDocRef.delete();

    // 5. Mint Firebase Custom Token for the user (Get or Create User by Phone)
    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await auth.getUserByPhoneNumber(normalizedPhone);
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        userRecord = await auth.createUser({
          phoneNumber: normalizedPhone,
        });
      } else {
        throw err;
      }
    }

    const customToken = await auth.createCustomToken(userRecord.uid);

    // 6. Upsert user document in Firestore users/{uid}
    const userRef = db.collection("users").doc(userRecord.uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      await userRef.set({
        id: userRecord.uid,
        phone: normalizedPhone,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await userRef.update({
        phone: normalizedPhone,
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 7. Return Custom Token
    res.status(200).json({
      accessToken: customToken,
      user: {
        id: userRecord.uid,
        phone: normalizedPhone,
      },
    });
  } catch (err: any) {
    functions.logger.error("Error in handleVerifyOtp:", err);
    res.status(500).json({
      status: "error",
      error: "INTERNAL_ERROR",
      message: err.message || "Failed to verify verification code.",
    });
  }
}

// Direct Cloud Function Exports
export const requestOtp = functions.https.onRequest(handleRequestOtp);
export const verifyOtp = functions.https.onRequest(handleVerifyOtp);

// Express Application Mounted at /auth
const app = express();

app.use((req, res, next) => {
  applyCors(req, res, next);
});

app.use(express.json());

// Routes supporting both relative and mounted /auth prefixes
app.post(["/request-otp", "/auth/request-otp", "/requestOtp", "/auth/requestOtp"], handleRequestOtp);
app.post(["/verify-otp", "/auth/verify-otp", "/verifyOtp", "/auth/verifyOtp"], handleVerifyOtp);

export const auth = functions.https.onRequest(app);
export const authApp = auth;
