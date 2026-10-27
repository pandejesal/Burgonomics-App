/**
 * AuthRepository — single entry point for the UI/state layer into auth
 * behaviour. Wraps the transport (`authService`) so screens and stores
 * never touch the transport directly.
 *
 * The leading `flow` (and `handle` on verify) is the accepted C-06 contract:
 * a challenge is owned by a mounted surface, not by a process-global slot.
 */
import { authService, type AuthService } from "@/features/auth/services/authService";
import { DEFAULT_DELIVERY_METHOD } from "@/features/auth/utils/validators";
import type { AuthFlowId } from "@/features/auth/utils/authErrors";

export class AuthRepository {
  constructor(private readonly service: AuthService = authService) {}

  requestOtp(
    flow: AuthFlowId,
    phone: string,
    deliveryMethod: "whatsapp" | "sms" = DEFAULT_DELIVERY_METHOD,
    otpToken?: string,
  ) {
    return this.service.requestOtp(flow, phone, deliveryMethod, otpToken);
  }

  resendOtp(flow: AuthFlowId) {
    return this.service.resendOtp(flow);
  }

  verifyOtp(flow: AuthFlowId, handle: string, code: string) {
    return this.service.verifyOtp(flow, handle, code);
  }

  refresh(refreshToken: string) {
    return this.service.refresh(refreshToken);
  }

  logout(refreshToken: string | null) {
    return this.service.logout(refreshToken);
  }
}

export const authRepository = new AuthRepository();
