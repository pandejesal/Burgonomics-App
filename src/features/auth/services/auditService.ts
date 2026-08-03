export interface AuditLogPayload {
  action:
    | "OTP_REQUESTED"
    | "OTP_SENT"
    | "OTP_FAILED"
    | "OTP_VERIFIED"
    | "OTP_EXPIRED"
    | "OTP_INVALID"
    | "OTP_RATE_LIMITED";
  phone: string;
  ip?: string;
  userAgent?: string;
  provider?: string;
  latencyMs?: number;
  attempts?: number;
  error?: string;
}

/**
 * Utility to securely mask phone numbers in logs.
 * Input: "+919876543210" -> Output: "+91 98******10"
 * Input: "9876543210" -> Output: "98******10"
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone) return "";
  const clean = phone.trim();
  if (clean.startsWith("+91") && clean.length === 13) {
    return `+91 ${clean.slice(3, 5)}******${clean.slice(-2)}`;
  }
  if (clean.length === 10) {
    return `${clean.slice(0, 2)}******${clean.slice(-2)}`;
  }
  // Generic fallback
  if (clean.length > 6) {
    return `${clean.slice(0, 3)}******${clean.slice(-3)}`;
  }
  return "******";
}

// In-Memory Prometheus-style metrics exporter
const prometheusMetrics = {
  otp_requests_total: 0,
  otp_sent_total: 0,
  otp_failures_total: { msg91: 0, fast2sms: 0, twilio: 0, generic: 0, overall: 0 },
  otp_verifications_total: 0,
  otp_expired_total: 0,
  otp_rate_limited_total: 0,
};

export const auditService = {
  log(payload: AuditLogPayload): void {
    const maskedPhone = maskPhoneNumber(payload.phone);
    const timestamp = new Date().toISOString();

    // Increment Metrics
    switch (payload.action) {
      case "OTP_REQUESTED":
        prometheusMetrics.otp_requests_total++;
        break;
      case "OTP_SENT":
        prometheusMetrics.otp_sent_total++;
        break;
      case "OTP_FAILED":
        prometheusMetrics.otp_failures_total.overall++;
        if (payload.provider) {
          const prov = payload.provider.toLowerCase() as keyof Omit<
            typeof prometheusMetrics.otp_failures_total,
            "overall"
          >;
          if (prov in prometheusMetrics.otp_failures_total) {
            prometheusMetrics.otp_failures_total[prov]++;
          }
        }
        break;
      case "OTP_VERIFIED":
        prometheusMetrics.otp_verifications_total++;
        break;
      case "OTP_EXPIRED":
        prometheusMetrics.otp_expired_total++;
        break;
      case "OTP_RATE_LIMITED":
        prometheusMetrics.otp_rate_limited_total++;
        break;
    }

    // Structure Console Log (Never log OTP code, mask phone numbers)
    console.log(
      JSON.stringify({
        timestamp,
        level: "INFO",
        logger: "AuditLogger",
        message: `OTP Event: ${payload.action}`,
        details: {
          action: payload.action,
          phone: maskedPhone,
          ip: payload.ip || "unknown",
          userAgent: payload.userAgent || "unknown",
          provider: payload.provider || "none",
          latencyMs: payload.latencyMs,
          attempts: payload.attempts,
          error: payload.error,
        },
      }),
    );
  },

  getMetricsString(): string {
    return [
      `# HELP burgonomics_otp_requests_total Total number of OTP request attempts`,
      `# TYPE burgonomics_otp_requests_total counter`,
      `burgonomics_otp_requests_total ${prometheusMetrics.otp_requests_total}`,
      ``,
      `# HELP burgonomics_otp_sent_total Total number of successfully sent OTPs`,
      `# TYPE burgonomics_otp_sent_total counter`,
      `burgonomics_otp_sent_total ${prometheusMetrics.otp_sent_total}`,
      ``,
      `# HELP burgonomics_otp_failures_total Total number of failed OTP delivery attempts`,
      `# TYPE burgonomics_otp_failures_total counter`,
      `burgonomics_otp_failures_total{provider="msg91"} ${prometheusMetrics.otp_failures_total.msg91}`,
      `burgonomics_otp_failures_total{provider="fast2sms"} ${prometheusMetrics.otp_failures_total.fast2sms}`,
      `burgonomics_otp_failures_total{provider="twilio"} ${prometheusMetrics.otp_failures_total.twilio}`,
      `burgonomics_otp_failures_total{provider="generic"} ${prometheusMetrics.otp_failures_total.generic}`,
      `burgonomics_otp_failures_total{provider="overall"} ${prometheusMetrics.otp_failures_total.overall}`,
      ``,
      `# HELP burgonomics_otp_verifications_total Total number of successfully verified OTPs`,
      `# TYPE burgonomics_otp_verifications_total counter`,
      `burgonomics_otp_verifications_total ${prometheusMetrics.otp_verifications_total}`,
      ``,
      `# HELP burgonomics_otp_expired_total Total number of expired OTP challenges`,
      `# TYPE burgonomics_otp_expired_total counter`,
      `burgonomics_otp_expired_total ${prometheusMetrics.otp_expired_total}`,
      ``,
      `# HELP burgonomics_otp_rate_limited_total Total number of rate-limited OTP requests`,
      `# TYPE burgonomics_otp_rate_limited_total counter`,
      `burgonomics_otp_rate_limited_total ${prometheusMetrics.otp_rate_limited_total}`,
    ].join("\n");
  },
};
