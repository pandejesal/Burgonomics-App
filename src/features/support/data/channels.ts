/**
 * Direct contact channels — LOCAL content built from values that already exist
 * in app config, plus in-app ticket creation (which really works).
 *
 * There is no GET /v1/support/channels route, so the old call only produced a
 * spinner and then an error.
 *
 * NEVER INVENTED: no phone number, WhatsApp number, chat widget, or opening
 * hours appear here, because none exist in APP (src/core/constants/app.ts).
 * Every value below is read from APP at render time, so a value that is absent
 * or still X-masked is omitted rather than printed (same rule as terms.tsx).
 */
import { APP, isUnsetRegistrationValue } from "@/core/constants/app";
import type { SupportChannel } from "@/features/support/models";

/** True when a configured value is real and safe to display as a link. */
function isRealValue(value: string | undefined): value is string {
  return !!value && !isUnsetRegistrationValue(value);
}

/**
 * The real channels. Order is deliberate: in-app ticketing first (it is the
 * only channel that can be actioned end-to-end in the app), then email.
 */
export function buildLocalChannels(): SupportChannel[] {
  const channels: SupportChannel[] = [
    {
      id: "in-app-ticket",
      label: "Raise a support ticket",
      kind: "form",
      available: true,
      helper:
        "Fastest route: describe the issue, attach up to 3 photos, and track the reply under Your Tickets.",
    },
  ];

  if (isRealValue(APP.supportEmail)) {
    channels.push({
      id: "support-email",
      label: "Email support",
      kind: "email",
      value: APP.supportEmail,
      available: true,
      helper: "For anything you'd rather put in writing.",
    });
  }

  if (isRealValue(APP.grievanceEmail)) {
    channels.push({
      id: "grievance-email",
      label: "Privacy & data requests",
      kind: "email",
      value: APP.grievanceEmail,
      available: true,
      helper: "Data access, correction, or erasure requests.",
    });
  }

  return channels;
}

export const LOCAL_CHANNELS: SupportChannel[] = buildLocalChannels();
