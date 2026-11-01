# Native release inputs

Set these GitHub Actions secrets separately in each repository (never commit values):
- MOBILE_PRODUCTION_ENV: JSON object of public VITE_* string values; VITE_APP_ENV=production, all six Firebase web configuration values, and the real HTTPS API base. Customer uses VITE_API_BASE_URL and VITE_PAYMENTS_API_BASE_URL plus VITE_RAZORPAY_KEY_ID=rzp_live_...; partner uses VITE_API_BASE. Include intended push flags. Values are bundled publicly, not server credentials.
- GOOGLE_SERVICES_JSON_BASE64: matching Android Firebase config, base64 encoded.
- GOOGLE_SERVICE_INFO_PLIST_BASE64: matching registered Apple Firebase config, base64 encoded.
- RELEASE_KEYSTORE_BASE64, RELEASE_STORE_PASSWORD, RELEASE_KEY_PASSWORD, RELEASE_KEY_ALIAS: Android upload signing inputs.

Preparation fails with the missing key name, never its value. Ignored generated files are .env.production, android/app/google-services.json and ios/App/App/GoogleService-Info.plist. Apple registrations/APNs keys must be configured by the account owner.

## Apple distribution secrets

ASC_API_KEY_BASE64 (base64 .p8), ASC_KEY_ID, ASC_ISSUER_ID, APPLE_TEAM_ID, IOS_CERTIFICATE_BASE64 (base64 distribution .p12), IOS_CERTIFICATE_PASSWORD, IOS_PROFILE_BASE64 (base64 App Store profile with exact bundle and production push). None set means unsigned archive; partial configuration fails with missing names. All present enables signed archive and IPA export only, never automatic upload. Temporary keychain/private files/profile are cleaned in finally.

## Apple web association
Set build environment TEAM_ID to the real Apple application-identifier prefix. Native CI maps APPLE_TEAM_ID secret to TEAM_ID. Every npm production/mobile build generates AASA; unset omits it, invalid fails and removes stale output. Host generated JSON without redirects; merge both app entries when sharing a host. No placeholder document is committed.
