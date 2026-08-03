import { User } from "lucide-react";
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
      className="rounded-[var(--radius-large)] border border-divider bg-surface p-4 shadow-[var(--shadow-low)]"
    >
      <div className="flex items-center gap-4">
        <div className="relative">
          <div
            aria-hidden
            className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary"
          >
            {profile.photoUrl ? (
              <SafeImage
                src={profile.photoUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : initials ? (
              <span className="type-headline-medium">{initials}</span>
            ) : (
              <User className="h-7 w-7" />
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Text variant="titleLarge" className="truncate">
              {profile.fullName || "Welcome"}
            </Text>
            {profile.membershipTier && <AppBadge tone="primary">{profile.membershipTier}</AppBadge>}
          </div>
          <Text variant="bodyMedium" tone="secondary" className="truncate">
            +91 {profile.phone}
          </Text>
          {profile.email && (
            <Text variant="caption" tone="secondary" className="truncate">
              {profile.email}
            </Text>
          )}
        </div>
        <CompletionRing percent={completion.percent} />
      </div>
      {completion.percent < 100 && completion.missing.length > 0 && (
        <div className="mt-3 rounded-[var(--radius-medium)] bg-primary/5 px-3 py-2">
          <Text variant="caption" tone="secondary">
            Complete your profile — add {completion.missing.slice(0, 2).join(", ").toLowerCase()}.
          </Text>
        </div>
      )}
    </section>
  );
}
