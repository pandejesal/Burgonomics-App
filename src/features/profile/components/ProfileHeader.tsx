import { User, CheckCircle2 } from "lucide-react";
import { Text } from "@/shared/components/common/Text";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { CompletionRing } from "./CompletionRing";
import { useLoyaltyTier } from "@/features/loyalty/state/loyaltyStore";
import type { UserProfile, ProfileCompletion } from "@/features/profile/models";

interface Props {
  profile: UserProfile;
  completion: ProfileCompletion;
}

export function ProfileHeader({ profile, completion }: Props) {
  // Tier always derives from the live loyalty balance (same source as the
  // wallet card) — never the static profile field, so the two can never
  // contradict each other.
  const tier = useLoyaltyTier();
  const initials = (profile.fullName || profile.phone)
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <section
      aria-label="Your profile"
      className="rounded-2xl border border-divider bg-surface p-5 shadow-xs"
    >
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div
            aria-hidden
            className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary-text font-semibold"
          >
            {profile.photoUrl ? (
              <SafeImage
                src={profile.photoUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : initials ? (
              <span className="text-lg font-semibold">{initials}</span>
            ) : (
              <User className="h-7 w-7" />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="type-title-large text-text">
              {profile.fullName || "Burger Connoisseur"}
            </h3>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary-text">
              {tier}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm text-text-secondary">
            <span className="tabular-nums">+91 {profile.phone}</span>
            <span title="Verified Mobile Number" className="inline-flex items-center">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
            </span>
          </div>

          {profile.email && (
            <p className="text-sm leading-relaxed text-text-secondary break-words">
              {profile.email}
            </p>
          )}
        </div>

        <div className="shrink-0">
          <CompletionRing percent={completion.percent} />
        </div>
      </div>

      {completion.percent < 100 && completion.missing.length > 0 && (
        <div className="mt-4 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3">
          <p className="text-sm leading-relaxed text-text-secondary">
            Complete your profile — add {completion.missing.slice(0, 2).join(", ").toLowerCase()}.
          </p>
        </div>
      )}
    </section>
  );
}

export default ProfileHeader;
