/**
 * Profile domain models — the frontend contract for user profile
 * data. Repositories map backend DTOs to these shapes. All optional
 * fields must be handled gracefully by UI.
 */
export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

export interface UserProfile {
  id: string;
  fullName: string;
  phone: string;
  /**
   * Tri-state on updates: a string sets the address, `null` erases it in
   * Firestore, `undefined` leaves it untouched — `""` is never valid and
   * must never be sent. `null`/absent renders as "no email on file".
   */
  email?: string | null;
  dateOfBirth?: string; // ISO yyyy-mm-dd
  gender?: Gender;
  photoUrl?: string;
  /** Repo-driven — reserved for future loyalty/rewards backend. */
  membershipTier?: string;
  createdAt?: string;
}

export type ProfileInput = Partial<
  Pick<UserProfile, "fullName" | "email" | "dateOfBirth" | "gender" | "photoUrl">
>;

export interface ProfileCompletion {
  percent: number; // 0..100
  missing: string[];
}
