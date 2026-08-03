import Redis from "ioredis";

export interface OtpChallenge {
  phone: string;
  codeHash: string; // Stored hashed, never plaintext
  encryptedCode?: string; // Symmetric encrypted ciphertext for channel fallback reuse
  expiresAt: number;
  attempts: number;
  deliveryMethod?: "whatsapp" | "sms";
}

let redisClient: Redis | null = null;
let redisHealthy = false;

// Initialize Redis if credentials are provided
function getRedisClient(): Redis | null {
  if (redisClient) return redisHealthy ? redisClient : null;

  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
  const password = process.env.REDIS_PASSWORD;
  const db = process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0;
  const useTls = process.env.REDIS_TLS === "true";

  if (!host) {
    console.log("[Redis] Host not configured. Operating in secure in-memory fallback mode.");
    return null;
  }

  try {
    redisClient = new Redis({
      host,
      port,
      password: password || undefined,
      db,
      tls: useTls ? {} : undefined,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      reconnectOnError: () => false,
      retryStrategy: (times) => {
        if (times > 3) {
          // Stop retrying to prevent endless connection attempts on development environment without Redis
          return null;
        }
        return Math.min(times * 100, 2000);
      },
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected successfully.");
      redisHealthy = true;
    });

    redisClient.on("error", (err) => {
      console.warn("[Redis] Connection warning (using in-memory fallback):", err.message);
      redisHealthy = false;
    });

    return redisClient;
  } catch (err) {
    console.warn(
      "[Redis] Failed to initialize client, operating in secure in-memory fallback mode:",
      err,
    );
    return null;
  }
}

// In-memory fallback stores when Redis is unavailable or unconfigured
const memoryChallenges = new Map<string, OtpChallenge>();
const memoryRequestCounts = new Map<string, { count: number; resetAt: number }>();
const memoryResendCooldowns = new Map<string, number>();

export const redisService = {
  /**
   * Saves an OTP challenge (hashed code)
   */
  async saveOtpChallenge(
    otpToken: string,
    challenge: OtpChallenge,
    ttlSeconds: number,
  ): Promise<void> {
    const client = getRedisClient();
    if (client && redisHealthy) {
      try {
        await client.set(`otp:${otpToken}`, JSON.stringify(challenge), "EX", ttlSeconds);
        return;
      } catch (err) {
        console.error("[Redis] Error in saveOtpChallenge, falling back to memory:", err);
      }
    }
    // Fallback
    memoryChallenges.set(otpToken, challenge);
    // Cleanup expired entries
    setTimeout(() => {
      memoryChallenges.delete(otpToken);
    }, ttlSeconds * 1000);
  },

  /**
   * Retrieves an OTP challenge
   */
  async getOtpChallenge(otpToken: string): Promise<OtpChallenge | null> {
    const client = getRedisClient();
    if (client && redisHealthy) {
      try {
        const data = await client.get(`otp:${otpToken}`);
        if (data) {
          return JSON.parse(data) as OtpChallenge;
        }
        return null;
      } catch (err) {
        console.error("[Redis] Error in getOtpChallenge, falling back to memory:", err);
      }
    }
    // Fallback
    const challenge = memoryChallenges.get(otpToken);
    if (challenge && Date.now() > challenge.expiresAt) {
      memoryChallenges.delete(otpToken);
      return null;
    }
    return challenge || null;
  },

  /**
   * Increments verification attempt counter
   */
  async incrementVerificationAttempt(otpToken: string): Promise<number> {
    const challenge = await this.getOtpChallenge(otpToken);
    if (!challenge) return 0;

    challenge.attempts += 1;

    // Save back to storage
    const ttlSeconds = Math.max(1, Math.ceil((challenge.expiresAt - Date.now()) / 1000));
    await this.saveOtpChallenge(otpToken, challenge, ttlSeconds);

    return challenge.attempts;
  },

  /**
   * Deletes an OTP challenge immediately (e.g. after successful verify or invalidation)
   */
  async deleteOtpChallenge(otpToken: string): Promise<void> {
    const client = getRedisClient();
    if (client && redisHealthy) {
      try {
        await client.del(`otp:${otpToken}`);
        return;
      } catch (err) {
        console.error("[Redis] Error in deleteOtpChallenge, falling back to memory:", err);
      }
    }
    memoryChallenges.delete(otpToken);
  },

  /**
   * Checks rate limiting for requesting OTP:
   * 1. 30 seconds resend cooldown
   * 2. Max 3 requests within 15 minutes (900s)
   */
  async checkRateLimit(phone: string, ip: string): Promise<{ limited: boolean; reason: string }> {
    const now = Date.now();
    const resendWindowSec = parseInt(process.env.OTP_RESEND_SECONDS || "30", 10);
    const limitWindowSec = parseInt(process.env.OTP_REQUEST_WINDOW || "900", 10);
    const maxRequests = parseInt(process.env.OTP_REQUEST_LIMIT || "3", 10);

    const client = getRedisClient();
    if (client && redisHealthy) {
      try {
        // 1. Check Resend Cooldown
        const cooldownExists = await client.get(`cooldown:${phone}`);
        if (cooldownExists) {
          return {
            limited: true,
            reason: `Please wait ${resendWindowSec} seconds before resending.`,
          };
        }

        // 2. Check Request Limit for phone & IP
        const phoneCountKey = `req_count:${phone}`;
        const ipCountKey = `req_count:${ip}`;

        const [phoneCount, ipCount] = await Promise.all([
          client.get(phoneCountKey),
          client.get(ipCountKey),
        ]);

        const pCount = phoneCount ? parseInt(phoneCount, 10) : 0;
        const iCount = ipCount ? parseInt(ipCount, 10) : 0;

        // IPs are allowed double the phone threshold to account for shared networks/Wi-Fi
        if (pCount >= maxRequests) {
          return {
            limited: true,
            reason: "Too many OTP requests. Please try again after 15 minutes.",
          };
        }
        if (iCount >= maxRequests * 2) {
          return {
            limited: true,
            reason: "Too many OTP requests from this connection. Please try again later.",
          };
        }

        return { limited: false, reason: "" };
      } catch (err) {
        console.error("[Redis] Error in checkRateLimit, falling back to memory:", err);
      }
    }

    // In-Memory Fallback Rate-Limiting
    // 1. Check Cooldown
    const cooldownExpiry = memoryResendCooldowns.get(phone);
    if (cooldownExpiry && now < cooldownExpiry) {
      return { limited: true, reason: `Please wait ${resendWindowSec} seconds before resending.` };
    }

    // 2. Check 15-min Request Limit for phone
    const phoneRecord = memoryRequestCounts.get(phone);
    if (phoneRecord && now < phoneRecord.resetAt) {
      if (phoneRecord.count >= maxRequests) {
        return {
          limited: true,
          reason: "Too many OTP requests. Please try again after 15 minutes.",
        };
      }
    }

    // 3. Check 15-min Request Limit for IP
    const ipRecord = memoryRequestCounts.get(ip);
    if (ipRecord && now < ipRecord.resetAt) {
      if (ipRecord.count >= maxRequests * 2) {
        return {
          limited: true,
          reason: "Too many OTP requests from this connection. Please try again later.",
        };
      }
    }

    return { limited: false, reason: "" };
  },

  /**
   * Records a successful OTP request to update rate limit counters and start resend cooldown.
   */
  async recordOtpRequest(phone: string, ip: string): Promise<void> {
    const resendWindowSec = parseInt(process.env.OTP_RESEND_SECONDS || "30", 10);
    const limitWindowSec = parseInt(process.env.OTP_REQUEST_WINDOW || "900", 10);

    const client = getRedisClient();
    if (client && redisHealthy) {
      try {
        const phoneCountKey = `req_count:${phone}`;
        const ipCountKey = `req_count:${ip}`;

        await Promise.all([
          // Start resend cooldown
          client.set(`cooldown:${phone}`, "1", "EX", resendWindowSec),
          // Increment request counts
          client.incr(phoneCountKey),
          client.incr(ipCountKey),
        ]);

        // Set or refresh TTL for counters
        const [phoneTtl, ipTtl] = await Promise.all([
          client.ttl(phoneCountKey),
          client.ttl(ipCountKey),
        ]);

        if (phoneTtl < 0) await client.expire(phoneCountKey, limitWindowSec);
        if (ipTtl < 0) await client.expire(ipCountKey, limitWindowSec);

        return;
      } catch (err) {
        console.error("[Redis] Error in recordOtpRequest, falling back to memory:", err);
      }
    }

    // In-Memory Fallback Recording
    const now = Date.now();

    // Set cooldown
    memoryResendCooldowns.set(phone, now + resendWindowSec * 1000);

    // Record for phone
    const phoneRecord = memoryRequestCounts.get(phone);
    if (phoneRecord && now < phoneRecord.resetAt) {
      phoneRecord.count += 1;
    } else {
      memoryRequestCounts.set(phone, { count: 1, resetAt: now + limitWindowSec * 1000 });
    }

    // Record for IP
    const ipRecord = memoryRequestCounts.get(ip);
    if (ipRecord && now < ipRecord.resetAt) {
      ipRecord.count += 1;
    } else {
      memoryRequestCounts.set(ip, { count: 1, resetAt: now + limitWindowSec * 1000 });
    }
  },
};
