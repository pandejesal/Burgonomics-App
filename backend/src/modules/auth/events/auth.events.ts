export const AUTH_EVENTS = {
  OTP_REQUESTED: 'auth.otp_requested',
  OTP_VERIFIED: 'auth.otp_verified',
  LOGIN_SUCCEEDED: 'auth.login_succeeded',
  LOGIN_FAILED: 'auth.login_failed',
  REFRESH_ROTATED: 'auth.refresh_rotated',
  REFRESH_REUSED: 'auth.refresh_reused',
  LOGGED_OUT: 'auth.logged_out',
} as const;

export interface OtpRequestedEvent {
  phone: string;
  challengeId: string;
  purpose: string;
}

export interface LoginSucceededEvent {
  userId: string;
  phone: string;
  isNewUser: boolean;
}

export interface RefreshReusedEvent {
  userId: string;
  refreshTokenId: string;
}
