"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashOtp = exports.decryptOtp = exports.encryptOtp = exports.sendOtpWithFallback = exports.isProviderConfigured = exports.getWhatsAppProvider = exports.getSMSProvider = exports.GenericHttpProvider = exports.Fast2SmsProvider = exports.TwilioProvider = exports.InteraktProvider = exports.GupshupProvider = exports.Msg91Provider = void 0;
const crypto = require("crypto");
// ============================================================================
// MSG91 Provider (Preferred)
// ============================================================================
class Msg91Provider {
    constructor() {
        this.name = "msg91";
    }
    isConfigured() {
        return !!process.env.MSG91_API_KEY;
    }
    formatPhone(phone) {
        let clean = phone;
        if (!phone.startsWith("+") && phone.length === 10) {
            clean = `91${phone}`;
        }
        else if (phone.startsWith("+")) {
            clean = phone.replace("+", "");
        }
        return clean;
    }
    async sendSMS(phone, code) {
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
            const resJson = (await response.json());
            if (!response.ok || resJson.type === "error") {
                console.error("[MSG91 SMS] Delivery failed:", resJson);
                return false;
            }
            return true;
        }
        catch (err) {
            console.error("[MSG91 SMS] Call failed:", err);
            return false;
        }
    }
    async sendWhatsAppOTP(phone, code) {
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
            const resJson = (await response.json());
            if (!response.ok || resJson.status === "error") {
                console.error("[MSG91 WhatsApp] Delivery failed:", resJson);
                return false;
            }
            return true;
        }
        catch (err) {
            console.error("[MSG91 WhatsApp] Call failed:", err);
            return false;
        }
    }
}
exports.Msg91Provider = Msg91Provider;
// ============================================================================
// Gupshup Provider
// ============================================================================
class GupshupProvider {
    constructor() {
        this.name = "gupshup";
    }
    isConfigured() {
        return !!process.env.GUPSHUP_API_KEY;
    }
    async sendSMS(phone, code) {
        // Gupshup SMS is typically integrated with dynamic route, falling back to basic REST call
        const apiKey = process.env.GUPSHUP_API_KEY;
        if (!apiKey)
            return false;
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
        }
        catch (err) {
            console.error("[Gupshup SMS] Delivery failed:", err);
            return false;
        }
    }
    async sendWhatsAppOTP(phone, code) {
        const apiKey = process.env.GUPSHUP_API_KEY;
        const sourceNumber = process.env.GUPSHUP_SOURCE_NUMBER || "919876543210";
        if (!apiKey) {
            console.warn("[Gupshup WhatsApp] Missing API key.");
            return false;
        }
        let cleanPhone = phone;
        if (phone.startsWith("+"))
            cleanPhone = phone.replace("+", "");
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
            const resJson = (await response.json());
            if (!response.ok || resJson.status === "error") {
                console.error("[Gupshup WhatsApp] Delivery failed:", resJson);
                return false;
            }
            return true;
        }
        catch (err) {
            console.error("[Gupshup WhatsApp] Call failed:", err);
            return false;
        }
    }
}
exports.GupshupProvider = GupshupProvider;
// ============================================================================
// Interakt Provider
// ============================================================================
class InteraktProvider {
    constructor() {
        this.name = "interakt";
    }
    isConfigured() {
        return !!process.env.INTERAKT_API_KEY;
    }
    async sendWhatsAppOTP(phone, code) {
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
        }
        else if (phone.length === 10) {
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
            const resJson = (await response.json());
            if (!response.ok || !resJson.result) {
                console.error("[Interakt WhatsApp] Delivery failed:", resJson);
                return false;
            }
            return true;
        }
        catch (err) {
            console.error("[Interakt WhatsApp] Call failed:", err);
            return false;
        }
    }
}
exports.InteraktProvider = InteraktProvider;
// ============================================================================
// Twilio Provider
// ============================================================================
class TwilioProvider {
    constructor() {
        this.name = "twilio";
    }
    isConfigured() {
        return !!(process.env.TWILIO_ACCOUNT_SID &&
            process.env.TWILIO_AUTH_TOKEN &&
            process.env.TWILIO_PHONE_NUMBER);
    }
    async sendSMS(phone, code) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;
        if (!accountSid || !authToken || !fromNumber)
            return false;
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
        }
        catch (err) {
            console.error("[Twilio SMS] Delivery failed:", err);
            return false;
        }
    }
    async sendWhatsAppOTP(phone, code) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;
        if (!accountSid || !authToken || !fromNumber)
            return false;
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
        }
        catch (err) {
            console.error("[Twilio WhatsApp] Delivery failed:", err);
            return false;
        }
    }
}
exports.TwilioProvider = TwilioProvider;
// ============================================================================
// Fast2SMS Provider (SMS Only)
// ============================================================================
class Fast2SmsProvider {
    constructor() {
        this.name = "fast2sms";
    }
    isConfigured() {
        return !!process.env.FAST2SMS_API_KEY;
    }
    async sendSMS(phone, code) {
        const apiKey = process.env.FAST2SMS_API_KEY;
        if (!apiKey)
            return false;
        let cleanNumber = phone;
        if (phone.startsWith("+91")) {
            cleanNumber = phone.slice(3);
        }
        else if (phone.startsWith("91") && phone.length === 12) {
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
            const resJson = (await response.json());
            return response.ok && !!resJson.return;
        }
        catch (err) {
            console.error("[Fast2SMS] Delivery failed:", err);
            return false;
        }
    }
}
exports.Fast2SmsProvider = Fast2SmsProvider;
// ============================================================================
// Generic HTTP Provider
// ============================================================================
class GenericHttpProvider {
    constructor() {
        this.name = "generic";
    }
    isConfigured() {
        return !!process.env.SMS_GATEWAY_URL;
    }
    async sendSMS(phone, code) {
        const gatewayUrl = process.env.SMS_GATEWAY_URL;
        if (!gatewayUrl)
            return false;
        const url = gatewayUrl
            .replace("{to}", encodeURIComponent(phone))
            .replace("{code}", encodeURIComponent(code));
        try {
            const response = await fetch(url);
            return response.ok;
        }
        catch (err) {
            console.error("[Generic SMS] Delivery failed:", err);
            return false;
        }
    }
    async sendWhatsAppOTP(phone, code) {
        const gatewayUrl = process.env.SMS_GATEWAY_URL; // Reusing or customizable
        if (!gatewayUrl)
            return false;
        const url = gatewayUrl
            .replace("{to}", encodeURIComponent(phone))
            .replace("{code}", encodeURIComponent(code))
            .replace("sms", "whatsapp"); // Attempt standard replacement
        try {
            const response = await fetch(url);
            return response.ok;
        }
        catch (err) {
            console.error("[Generic WhatsApp] Delivery failed:", err);
            return false;
        }
    }
}
exports.GenericHttpProvider = GenericHttpProvider;
// ============================================================================
// Factory & Orchestration
// ============================================================================
function getSMSProvider() {
    const providerName = (process.env.SMS_PROVIDER || "msg91").toLowerCase();
    const providers = {
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
exports.getSMSProvider = getSMSProvider;
function getWhatsAppProvider() {
    const providerName = (process.env.WHATSAPP_PROVIDER || "msg91").toLowerCase();
    const providers = {
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
exports.getWhatsAppProvider = getWhatsAppProvider;
function isProviderConfigured(name) {
    var _a, _b;
    const providers = {
        msg91: new Msg91Provider(),
        gupshup: new GupshupProvider(),
        interakt: new InteraktProvider(),
        twilio: new TwilioProvider(),
        fast2sms: new Fast2SmsProvider(),
        generic: new GenericHttpProvider(),
    };
    return (_b = (_a = providers[name]) === null || _a === void 0 ? void 0 : _a.isConfigured()) !== null && _b !== void 0 ? _b : false;
}
exports.isProviderConfigured = isProviderConfigured;
/**
 * High-performance fallback-enabled sender for Multi-Channel dispatch
 */
async function sendOtpWithFallback(phone, code, channel) {
    const errorLogs = [];
    if (channel === "whatsapp") {
        const provider = getWhatsAppProvider();
        if (provider) {
            try {
                const ok = await provider.sendWhatsAppOTP(phone, code);
                if (ok) {
                    return { success: true, providerUsed: `whatsapp:${provider.name}`, errorLogs };
                }
                errorLogs.push(`Primary WhatsApp provider [${provider.name}] failed delivery.`);
            }
            catch (err) {
                errorLogs.push(`Primary WhatsApp error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        else {
            errorLogs.push("No WhatsApp providers are configured.");
        }
        return { success: false, providerUsed: "none", errorLogs };
    }
    else {
        const provider = getSMSProvider();
        if (provider) {
            try {
                const ok = await provider.sendSMS(phone, code);
                if (ok) {
                    return { success: true, providerUsed: `sms:${provider.name}`, errorLogs };
                }
                errorLogs.push(`Primary SMS provider [${provider.name}] failed delivery.`);
            }
            catch (err) {
                errorLogs.push(`Primary SMS error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        else {
            errorLogs.push("No SMS providers are configured.");
        }
        return { success: false, providerUsed: "none", errorLogs };
    }
}
exports.sendOtpWithFallback = sendOtpWithFallback;
// ============================================================================
// Cryptographic Symmetric Encryption for secure code reuse during fallbacks
// ============================================================================
const ALGORITHM = "aes-256-gcm";
function getSymmetricKey() {
    const secret = process.env.OTP_SYMMETRIC_SECRET;
    if (!secret) {
        throw new Error("CRITICAL SECURITY ERROR: OTP_SYMMETRIC_SECRET environment variable is missing.");
    }
    return crypto.createHash("sha256").update(secret).digest();
}
function encryptOtp(text) {
    try {
        const key = getSymmetricKey();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(text, "utf8", "hex");
        encrypted += cipher.final("hex");
        const authTag = cipher.getAuthTag().toString("hex");
        return `${iv.toString("hex")}:${authTag}:${encrypted}`;
    }
    catch (err) {
        console.error("[Crypto] Encryption failed:", err);
        throw new Error("Symmetric encryption error.");
    }
}
exports.encryptOtp = encryptOtp;
function decryptOtp(cipherText) {
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
    }
    catch (err) {
        console.error("[Crypto] Decryption failed:", err);
        throw new Error("Symmetric decryption error.");
    }
}
exports.decryptOtp = decryptOtp;
function hashOtp(code, salt) {
    return crypto.createHash("sha256").update(`${code}:${salt}`).digest("hex");
}
exports.hashOtp = hashOtp;
//# sourceMappingURL=smsProvider.js.map