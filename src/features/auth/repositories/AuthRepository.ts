/**
 * AuthRepository — single entry point for the UI/state layer into auth
 * behaviour. Wraps the transport (`authService`) so screens and stores
 * never touch the transport directly.
 *
 * Backend integration: swap the injected `service` with a real
 * `httpClient`-backed implementation. The public surface (method names,
 * argument shapes, `ApiResult` returns) must stay unchanged so no UI
 * code needs to move.
 */
import {
  authService,
  type AuthService,
  type AuthSessionRef,
} from "@/features/auth/services/authService";
import { DEFAULT_DELIVERY_METHOD } from "@/features/auth/utils/validators";
import type { ApiResult } from "@/core/network/http";

export class AuthRepository {
  constructor(private readonly service: AuthService = authService) {}

  requestOtp(
    phone: string,
    deliveryMethod: "whatsapp" | "sms" = DEFAULT_DELIVERY_METHOD,
    otpToken?: string,
  ) {
    return this.service.requestOtp(phone, deliveryMethod, otpToken);
  }

  verifyOtp(otpToken: string, code: string) {
    return this.service.verifyOtp(otpToken, code);
  }

  refresh(refreshToken: string) {
    return this.service.refresh(refreshToken);
  }

  logout(refreshToken: string | null): Promise<ApiResult<null>> {
    return this.service.logout(refreshToken);
  }

  /**
   * Drops any in-flight OTP challenge on the transport.
   *
   * Optional on the seam so injected/fake services without challenge state
   * still satisfy the repository contract.
   */
  cancelChallenge(): void {
    this.service.cancelChallenge?.();
  }

  /**
   * Signs out only the session a cancelled verify created. Optional on the
   * seam so injected services without session state still satisfy it.
   */
  discardConfirmedSession(ref: AuthSessionRef): Promise<void> {
    return this.service.discardConfirmedSession?.(ref) ?? Promise.resolve();
  }
}

export const authRepository = new AuthRepository();
