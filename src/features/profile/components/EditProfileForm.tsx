import * as React from "react";
import { AppButton } from "@/shared/components/common/AppButton";
import { TextField } from "@/shared/components/common/TextField";
import { Text } from "@/shared/components/common/Text";
import { cn } from "@/lib/utils";
import { profileRepository } from "@/features/profile/repositories/ProfileRepository";
import type { Gender, UserProfile } from "@/features/profile/models";

const GENDERS: Array<{ value: Gender; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

interface Props {
  profile: UserProfile;
  onCancel: () => void;
  onSaved: () => void;
}

export function EditProfileForm({ profile, onCancel, onSaved }: Props) {
  const [fullName, setFullName] = React.useState(profile.fullName ?? "");
  const [email, setEmail] = React.useState(profile.email ?? "");
  const [dateOfBirth, setDateOfBirth] = React.useState(profile.dateOfBirth ?? "");
  const [gender, setGender] = React.useState<Gender | undefined>(profile.gender);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await profileRepository.update({
      fullName: fullName.trim(),
      email: email.trim() || undefined,
      dateOfBirth: dateOfBirth || undefined,
      gender,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error.message);
      return;
    }
    onSaved();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Photo placeholder */}
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary type-headline-medium">
          {(fullName || profile.phone).slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1">
          <Text variant="titleMedium">Profile photo</Text>
          <Text variant="caption" tone="secondary">
            Photo uploads are coming soon.
          </Text>
        </div>
        <AppButton type="button" variant="outlined" size="sm" disabled>
          Change
        </AppButton>
      </div>

      <TextField
        label="Full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        autoComplete="name"
        required
      />

      <TextField
        label="Mobile number"
        value={`+91 ${profile.phone}`}
        readOnly
        helper="Changing your number requires OTP verification (coming soon)."
      />

      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        placeholder="you@example.com"
      />

      <TextField
        label="Date of birth (optional)"
        type="date"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
      />

      <fieldset>
        <legend className="type-caption uppercase text-text-secondary mb-2">
          Gender (optional)
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {GENDERS.map((opt) => {
            const active = gender === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGender(active ? undefined : opt.value)}
                aria-pressed={active}
                className={cn(
                  "min-h-[44px] rounded-full border px-3 type-label-large transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-divider text-text-secondary hover:border-primary/40",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <div role="alert">
          <Text variant="bodyMedium" tone="error">
            {error}
          </Text>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
        <AppButton type="button" variant="outlined" fullWidth onClick={onCancel}>
          Cancel
        </AppButton>
        <AppButton type="submit" fullWidth loading={busy}>
          Save changes
        </AppButton>
      </div>
    </form>
  );
}
