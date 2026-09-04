import * as React from "react";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AppButton } from "@/shared/components/common/AppButton";
import { TextField } from "@/shared/components/common/TextField";
import { Text } from "@/shared/components/common/Text";
import {
  COUNTRY_CODE,
  PHONE_LENGTH,
  validatePhone,
} from "@/features/auth/utils/validators";
import { APP } from "@/core/constants/app";

export interface PhoneLoginFormProps {
  onSubmit: (phone: string) => Promise<void>;
  isSubmitting?: boolean;
  serverError?: string | null;
  onClearError?: () => void;
}

export function PhoneLoginForm({
  onSubmit,
  isSubmitting = false,
  serverError,
  onClearError,
}: PhoneLoginFormProps) {
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);

  const validation = useMemo(() => validatePhone(phone), [phone]);
  const inlineError = touched && !validation.valid ? validation.error : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);

    if (!validation.valid || isSubmitting) return;

    if (onClearError) {
      onClearError();
    }

    await onSubmit(phone);
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mx-auto flex min-h-[100dvh] w-full max-w-[28rem] md:max-w-[28rem] max-md:max-w-full flex-col justify-between px-6 pb-8 pt-12"
    >
      <div className="flex flex-col gap-8">
        {/* Brand Icon & Welcome Title */}
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-medium">
            <span className="type-headline-large font-bold">B</span>
          </div>
          <Text variant="headlineLarge" as="h1" className="text-center font-bold text-text-primary">
            Welcome to {APP.name}
          </Text>
          <Text variant="bodyMedium" tone="secondary" className="text-center">
            Enter your 10-digit mobile number to continue. We'll send a secure SMS verification code.
          </Text>
        </div>

        {/* Phone Input with +91 Country Badge */}
        <div className="flex flex-col gap-2 w-full min-w-0 mx-auto">
          <div className="flex items-stretch gap-2 w-full min-w-0">
            <div
              aria-label="Country code"
              className="flex min-h-[56px] shrink-0 items-center justify-center rounded-[var(--radius-medium)] border-[1.5px] border-divider bg-surface px-3.5 type-body-large font-medium text-text-primary shadow-low"
            >
              <span>{COUNTRY_CODE}</span>
            </div>
            <div className="flex-1 min-w-0">
              <TextField
                className="w-full min-w-0"
                label="Mobile number"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="tel-national"
                aria-label="Mobile number, 10 digits"
                placeholder="98XXXXXXXX"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (serverError && onClearError) {
                    onClearError();
                  }
                }}
                onBlur={() => setTouched(true)}
                error={inlineError}
                helper={!inlineError ? `${phone.length}/${PHONE_LENGTH} digits` : undefined}
                autoFocus
              />
            </div>
          </div>

          {serverError && (
            <div
              role="alert"
              className="rounded-[var(--radius-medium)] border border-error/40 bg-error/10 px-4 py-3"
            >
              <Text variant="bodyMedium" tone="error">
                {serverError}
              </Text>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-8">
        <AppButton
          type="submit"
          fullWidth
          size="lg"
          variant="cta"
          loading={isSubmitting}
          disabled={!validation.valid || isSubmitting}
        >
          Continue
        </AppButton>

        <Text variant="caption" tone="secondary" className="text-center">
          By continuing, you agree to our{" "}
          <Link to="/terms" className="underline text-primary font-medium">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline text-primary font-medium">
            Privacy Policy
          </Link>
          .
        </Text>

        {/* reCAPTCHA Invisible/Visible Anchor */}
        <div id="recaptcha-container" className="flex justify-center my-1" />
      </div>
    </form>
  );
}
