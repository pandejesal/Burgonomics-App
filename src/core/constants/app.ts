export const APP = {
  name: "BURGONOMICS",
  // Single-sourced display version — settings/about footers render
  // APP.version instead of hardcoding it in each route.
  version: "1.0.0",
  tagline: "The House of DAMN GOOD BURGERS!!",
  vegPromise: "100% Pure Veg",
  supportEmail: "support@burgonomics.com",
  grievanceEmail: "privacy@burgonomics.com",
  nodalEmail: "nodal@burgonomics.com",
  currency: "INR",
  locale: "en-IN",
  // Registration IDs: populate with the real filings when available. Values
  // still carrying the X-mask placeholder are treated as unset — customer-
  // facing legal/invoice surfaces must omit those rows, never print filler
  // (P1-7). `cin` is intentionally empty: the GST certificate names a
  // partnership, so no CIN applies unless a company is incorporated.
  legalEntity: "PANCHTATVA FOODS",
  tradeName: "Burgonomics",
  registeredAddress:
    "A-802, Unicus Shyamal, Shyamal Cross Road, Satellite, Ahmedabad, Gujarat 380015",
  cin: "",
  fssaiLicense: "1072XXXXXXXXXX",
  gstin: "24ABHFP6677N1ZG",
  minTouchTargetDp: 48,
} as const;

/**
 * True when a registration/contact value is absent or still carries the
 * X-mask placeholder. Use before rendering statutory disclosures (P1-7).
 */
export const isUnsetRegistrationValue = (value: string | undefined): boolean =>
  !value || /X{4,}/i.test(value);
