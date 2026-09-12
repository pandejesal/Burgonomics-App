import { User, CheckCircle2 } from "lucide-react";
import { Text } from "@/shared/components/common/Text";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { CompletionRing } from "./CompletionRing";
import type { UserProfile, ProfileCompletion } from "@/features/profile/models";

interface Props {
  profile: UserProfile;
  completion: ProfileCompletion;
}

export function ProfileHeader({ profile, completion }: Props) {
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
      className="rounded-2xl border border-divider bg-surface p-4 shadow-xs"
    >
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div
            aria-hidden
            className="grid h-16 w-16 place-items-center rounded-full bg-[#0E4825]/10 text-[#0E4825] dark:text-[#4ADE80] font-black"
          >
            {profile.photoUrl ? (
              <SafeImage
                src={profile.photoUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : initials ? (
              <span className="text-lg font-black">{initials}</span>
            ) : (
              <User className="h-7 w-7" />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h3 className="text-base font-black text-text truncate">
              {profile.fullName || "Burger Connoisseur"}
            </h3>
            {profile.membershipTier && (
              <span className="px-2 py-0.5 rounded-full bg-[#0E4825]/15 text-[#0E4825] dark:text-[#4ADE80] text-[10px] font-black uppercase">
                {profile.membershipTier}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="font-mono font-medium">+91 {profile.phone}</span>
            <span title="Verified Mobile Number" className="inline-flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
            </span>
          </div>

          {profile.email && (
            <p className="text-[11px] text-text-secondary truncate">
              {profile.email}
            </p>
          )}
        </div>

        <div className="shrink-0">
          <CompletionRing percent={completion.percent} />
        </div>
      </div>

      {completion.percent < 100 && completion.missing.length > 0 && (
        <div className="mt-3 rounded-xl bg-[#0E4825]/5 border border-[#0E4825]/10 px-3 py-2">
          <p className="text-[11px] text-text-secondary">
            Complete your profile — add {completion.missing.slice(0, 2).join(", ").toLowerCase()}.
          </p>
        </div>
      )}
    </section>
  );
}

export default ProfileHeader;
