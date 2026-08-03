/**
 * Contract every SMS-OTP provider must implement (MSG91, Kaleyra,
 * Twilio, in-house). Registered under `OTP_PROVIDER` in a later phase;
 * the AuthService depends only on this port.
 */
export const OTP_PROVIDER = Symbol('OTP_PROVIDER');

export interface OtpSendInput {
  phone: string;
  code: string;
  purpose: string;
}

export interface OtpSendResult {
  providerMessageId: string;
  deliveredAt: Date;
}

export interface OtpProvider {
  readonly name: string;
  send(input: OtpSendInput): Promise<OtpSendResult>;
}
