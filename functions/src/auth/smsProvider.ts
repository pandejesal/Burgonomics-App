import * as crypto from "crypto";

// ============================================================================
// Core Interfaces
// ============================================================================

export interface MessageProvider {
  readonly name: string;
  isConfigured(): boolean;
}

export interface SMSProvider extends MessageProvider {
  sendSMS(phone: string, code: string): Promise<boolean>;
}

export interface WhatsAppProvider extends MessageProvider {
  sendWhatsAppOTP(phone: string, code: string): Promise<boolean>;
}

// ============================================================================
// MSG91 Provider (Preferred)
// ============================================================================

export class Msg91Provider implements SMSProvider, WhatsAppProvider {
  readonly name = "msg91";

  isConfigured(): boolean {
    return !!process.env.MSG91_API_KEY;
  }

  private formatPhone(phone: string): string {
    let clean = phone;
    if (!phone.startsWith("+") && phone.length === 10) {
      clean = `91${phone}`;
    } else if (phone.startsWith("+")) {
      clean = phone.replace("+", "");
    }
    return clean;
  }

  async sendSMS(phone: string, code: string): Promise<boolean> {
    const apiKey = process.env.MSG91_API_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;
    const senderId = process.env.MSG91_SENDER_ID || "BURGER";

    if (!apiKey || !templateId) {
      console.warn("[MSG91 SMS] Missing API key or template ID.");
      return false;
    }

    const formattedPhone = this.formatPhone(phone);
    const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${formattedPhone}&otp=${code}&sender=${senderId}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authkey: apiKey,
        },
        body: JSON.stringify({}),
      });

      const resJson = (await response.json()) as { type?: string; message?: string };
      if (!response.ok || resJson.type === "error") {
        console.error("[MSG91 SMS] Delivery failed:", resJson);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[MSG91 SMS] Call failed:", err);
      return false;
    }
  }

  async sendWhatsAppOTP(phone: string, code: string): Promise<boolean> {
    const apiKey = process.env.MSG91_API_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID || "otp_template";
    const senderId = process.env.MSG91_SENDER_ID || "BURGER";

    if (!apiKey) {
      console.warn("[MSG91 WhatsApp] Missing API key.");
      return false;
    }

    const formattedPhone = this.formatPhone(phone);
    const url = "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

    const payload = {
      integrated_number: senderId,
      content_type: "template",
      payload: {
        to: formattedPhone,
        template_name: templateId,
        language_code: "en",
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: code,
              },
            ],
          },
        ],
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authkey: apiKey,
        },
        body: JSON.stringify(payload),
      });

      const resJson = (await response.json()) as { status?: string; message?: string };
      if (!response.ok || resJson.status === "error") {
        console.error("[MSG91 WhatsApp] Delivery failed:", resJson);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[MSG91 WhatsApp] Call failed:", err);
      return false;
    }
  }
}

// ============================================================================
// Gupshup Provider
// ============================================================================

export class GupshupProvider implements SMSProvider, WhatsAppProvider {
  readonly name = "gupshup";

  isConfigured(): boolean {
    return !!process.env.GUPSHUP_API_KEY;
  }

  async sendSMS(phone: string, code: string): Promise<boolean> {
    // Gupshup SMS is typically integrated with dynamic route, falling back to basic REST call
    const apiKey = process.env.GUPSHUP_API_KEY;
    if (!apiKey) return false;

    const url = "https://enterprise.smsgupshup.com/GatewayAPI/rest";
    const params = new URLSearchParams({
      method: "SendMessage",
      send_to: phone.replace("+", ""),
      msg: `Your BURGONOMICS verification code is ${code}.`,
      msg_type: "TEXT",
      v: "1.1",
      auth_scheme: "plain",
      apiKey,
    });

    try {
      const response = await fetch(`${url}?${params.toString()}`);
      return response.ok;
    } catch (err) {
      console.error("[Gupshup SMS] Delivery failed:", err);
      return false;
    }
  }

  async sendWhatsAppOTP(phone: string, code: string): Promise<boolean> {
    const apiKey = process.env.GUPSHUP_API_KEY;
    const sourceNumber = process.env.GUPSHUP_SOURCE_NUMBER || "919876543210";

    if (!apiKey) {
      console.warn("[Gupshup WhatsApp] Missing API key.");
      return false;
    }

    let cleanPhone = phone;
    if (phone.startsWith("+")) cleanPhone = phone.replace("+", "");

    const url = "https://api.gupshup.io/sm/api/v1/msg";
    const headers = {
      apikey: apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const body = new URLSearchParams({
      channel: "whatsapp",
      source: sourceNumber,
      destination: cleanPhone,
      message: JSON.stringify({
        type: "text",
        text: `Your BURGONOMICS verification code is ${code}. It is valid for 5 minutes.`,
      }),
      "src.name": "Burgonomics",
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: body.toString(),
      });

      const resJson = (await response.json()) as { status?: string; message?: string };
      if (!response.ok || resJson.status === "error") {
        console.error("[Gupshup WhatsApp] Delivery failed:", resJson);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[Gupshup WhatsApp] Call failed:", err);
      return false;
    }
  }
}

// ============================================================================
// Interakt Provider
// ============================================================================

export class InteraktProvider implements WhatsAppProvider {
  readonly name = "interakt";

  isConfigured(): boolean {
    return !!process.env.INTERAKT_API_KEY;
  }

  async sendWhatsAppOTP(phone: string, code: string): Promise<boolean> {
    const apiKey = process.env.INTERAKT_API_KEY;
    const templateName = process.env.INTERAKT_TEMPLATE_ID || "otp_template";

    if (!apiKey) {
      console.warn("[Interakt] Missing API key.");
      return false;
    }

    const url = "https://api.interakt.ai/v1/public/message/";
    const headers = {
      Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
      "Content-Type": "application/json",
    };

    // Parse country code & phone number
    let countryCode = "+91";
    let phoneNumber = phone;
    if (phone.startsWith("+")) {
      countryCode = phone.slice(0, 3);
      phoneNumber = phone.slice(3);
    } else if (phone.length === 10) {
      phoneNumber = phone;
    }

    const body = {
      countryCode,
      phoneNumber,
      type: "Template",
      template: {
        name: templateName,
        languageCode: "en",
        bodyValues: [code],
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const resJson = (await response.json()) as { result?: boolean; message?: string };
      if (!response.ok || !resJson.result) {
        console.error("[Interakt WhatsApp] Delivery failed:", resJson);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[Interakt WhatsApp] Call failed:", err);
      return false;
    }
  }
}

// ============================================================================
// Twilio Provider
// ============================================================================

export class TwilioProvider implements SMSProvider, WhatsAppProvider {
  readonly name = "twilio";

  isConfigured(): boolean {
    return !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    );
  }

  async sendSMS(phone: string, code: string): Promise<boolean> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) return false;

    let formattedTo = phone;
    if (!phone.startsWith("+")) {
      formattedTo = phone.length === 10 ? `+91${phone}` : `+${phone}`;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: formattedTo,
      From: fromNumber,
      Body: `Your BURGONOMICS verification code is ${code}. It is valid for 5 minutes.`,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      return response.ok;
    } catch (err) {
      console.error("[Twilio SMS] Delivery failed:", err);
      return false;
    }
  }

  async sendWhatsAppOTP(phone: string, code: string): Promise<boolean> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) return false;

    let formattedTo = phone;
    if (!phone.startsWith("+")) {
      formattedTo = phone.length === 10 ? `+91${phone}` : `+${phone}`;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: `whatsapp:${formattedTo}`,
      From: `whatsapp:${fromNumber}`,
      Body: `Your BURGONOMICS verification code is ${code}. It is valid for 5 minutes.`,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      return response.ok;
    } catch (err) {
      console.error("[Twilio WhatsApp] Delivery failed:", err);
      return false;
    }
  }
}

// ============================================================================
// Fast2SMS Provider (SMS Only)
// ============================================================================

export class Fast2SmsProvider implements SMSProvider {
  readonly name = "fast2sms";

  isConfigured(): boolean {
    return !!process.env.FAST2SMS_API_KEY;
  }

  async sendSMS(phone: string, code: string): Promise<boolean> {
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) return false;

    let cleanNumber = phone;
    if (phone.startsWith("+91")) {
      cleanNumber = phone.slice(3);
    } else if (phone.startsWith("91") && phone.length === 12) {
      cleanNumber = phone.slice(2);
    }

    const url = "https://www.fast2sms.com/dev/bulkV2";
    const body = {
      route: "otp",
      variables_values: code,
      numbers: cleanNumber,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const resJson = (await response.json()) as { return?: boolean };
      return response.ok && !!resJson.return;
    } catch (err) {
      console.error("[Fast2SMS] Delivery failed:", err);
      return false;
    }
  }
}

// ============================================================================
// Generic HTTP Provider
// ============================================================================

export class GenericHttpProvider implements SMSProvider, WhatsAppProvider {
  readonly name = "generic";

  isConfigured(): boolean {
    return !!process.env.SMS_GATEWAY_URL;
  }

  async sendSMS(phone: string, code: string): Promise<boolean> {
    const gatewayUrl = process.env.SMS_GATEWAY_URL;
    if (!gatewayUrl) return false;

    const url = gatewayUrl
      .replace("{to}", encodeURIComponent(phone))
      .replace("{code}", encodeURIComponent(code));

    try {
      const response = await fetch(url);
      return response.ok;
    } catch (err) {
      console.error("[Generic SMS] Delivery failed:", err);
      return false;
    }
  }

  async sendWhatsAppOTP(phone: string, code: string): Promise<boolean> {
    const gatewayUrl = process.env.SMS_GATEWAY_URL; // Reusing or customizable
    if (!gatewayUrl) return false;

    const url = gatewayUrl
      .replace("{to}", encodeURIComponent(phone))
      .replace("{code}", encodeURIComponent(code))
      .replace("sms", "whatsapp"); // Attempt standard replacement

    try {
      const response = await fetch(url);
      return response.ok;
    } catch (err) {
      console.error("[Generic WhatsApp] Delivery failed:", err);
      return false;
    }
  }
}

// ============================================================================
// Factory & Orchestration
// ============================================================================

export function getSMSProvider(): SMSProvider | null {
  const providerName = (process.env.SMS_PROVIDER || "msg91").toLowerCase();
  const providers: Record<string, SMSProvider> = {
    msg91: new Msg91Provider(),
    gupshup: new GupshupProvider(),
    twilio: new TwilioProvider(),
    fast2sms: new Fast2SmsProvider(),
    generic: new GenericHttpProvider(),
  };

  const selected = providers[providerName];
  if (selected && selected.isConfigured()) {
    return selected;
  }

  // Find any configured SMS provider as fallback
  for (const key of Object.keys(providers)) {
    if (providers[key].isConfigured()) {
      return providers[key];
    }
  }

  return null;
}

export function getWhatsAppProvider(): WhatsAppProvider | null {
  const providerName = (process.env.WHATSAPP_PROVIDER || "msg91").toLowerCase();
  const providers: Record<string, WhatsAppProvider> = {
    msg91: new Msg91Provider(),
    gupshup: new GupshupProvider(),
    interakt: new InteraktProvider(),
    twilio: new TwilioProvider(),
    generic: new GenericHttpProvider(),
  };

  const selected = providers[providerName];
  if (selected && selected.isConfigured()) {
    return selected;
  }

  // Find any configured WhatsApp provider as fallback
  for (const key of Object.keys(providers)) {
    if (providers[key].isConfigured()) {
      return providers[key];
    }
  }

  return null;
}

export function isProviderConfigured(name: string): boolean {
  const providers: Record<string, MessageProvider> = {
    msg91: new Msg91Provider(),
    gupshup: new GupshupProvider(),
    interakt: new InteraktProvider(),
    twilio: new TwilioProvider(),
    fast2sms: new Fast2SmsProvider(),
    generic: new GenericHttpProvider(),
  };
  return providers[name]?.isConfigured() ?? false;
}

/**
 * High-performance fallback-enabled sender for Multi-Channel dispatch
 */
export async function sendOtpWithFallback(
  phone: string,
  code: string,
  channel: "whatsapp" | "sms",
): Promise<{ success: boolean; providerUsed: string; errorLogs: string[] }> {
  const errorLogs: string[] = [];

  if (channel === "whatsapp") {
    const provider = getWhatsAppProvider();
    if (provider) {
      try {
        const ok = await provider.sendWhatsAppOTP(phone, code);
        if (ok) {
          return { success: true, providerUsed: `whatsapp:${provider.name}`, errorLogs };
        }
        errorLogs.push(`Primary WhatsApp provider [${provider.name}] failed delivery.`);
      } catch (err: unknown) {
        errorLogs.push(
          `Primary WhatsApp error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      errorLogs.push("No WhatsApp providers are configured.");
    }
    return { success: false, providerUsed: "none", errorLogs };
  } else {
    const provider = getSMSProvider();
    if (provider) {
      try {
        const ok = await provider.sendSMS(phone, code);
        if (ok) {
          return { success: true, providerUsed: `sms:${provider.name}`, errorLogs };
        }
        errorLogs.push(`Primary SMS provider [${provider.name}] failed delivery.`);
      } catch (err: unknown) {
        errorLogs.push(`Primary SMS error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errorLogs.push("No SMS providers are configured.");
    }
    return { success: false, providerUsed: "none", errorLogs };
  }
}

// ============================================================================
// Cryptographic Symmetric Encryption for secure code reuse during fallbacks
// ============================================================================

const ALGORITHM = "aes-256-gcm";

function getSymmetricKey(): Buffer {
  const secret = process.env.OTP_SYMMETRIC_SECRET;
  if (!secret) {
    throw new Error(
      "CRITICAL SECURITY ERROR: OTP_SYMMETRIC_SECRET environment variable is missing.",
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptOtp(text: string): string {
  try {
    const key = getSymmetricKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error("[Crypto] Encryption failed:", err);
    throw new Error("Symmetric encryption error.");
  }
}

export function decryptOtp(cipherText: string): string {
  try {
    const key = getSymmetricKey();
    const [ivHex, tagHex, encryptedHex] = cipherText.split(":");
    if (!ivHex || !tagHex || !encryptedHex) {
      throw new Error("Invalid cipher format");
    }
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("[Crypto] Decryption failed:", err);
    throw new Error("Symmetric decryption error.");
  }
}

export function hashOtp(code: string, salt: string): string {
  return crypto.createHash("sha256").update(`${code}:${salt}`).digest("hex");
}
