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
import { authService, type AuthService } from "@/features/auth/services/authService";
import type { ApiResult } from "@/core/network/http";

export class AuthRepository {
  constructor(private readonly service: AuthService = authService) {}

  requestOtp(phone: string, deliveryMethod: "whatsapp" | "sms" = "whatsapp", otpToken?: string) {
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
}

export const authRepository = new AuthRepository();
