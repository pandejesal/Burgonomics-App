// CI simulator fixture only: never used by production preparation or archive jobs.
import { writeFileSync } from 'node:fs';
if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'macOS' || process.env.CI_SIMULATOR_ONLY !== 'true') {
  throw new Error('Compile-only fixture is restricted to the explicit GitHub macOS simulator lane');
}
// Fake, but shaped like a real key: the native Firebase SDK aborts the app at launch
// unless the key is 39 characters and starts with A, which made the launch smoke fail.
const FAKE_API_KEY = 'ACiSimulatorNotARealApiKey'.padEnd(39, '0');
const values = {
  VITE_APP_ENV: 'staging', VITE_FIREBASE_API_KEY: FAKE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: 'ci-simulator.invalid', VITE_FIREBASE_PROJECT_ID: 'ci-simulator',
  VITE_FIREBASE_STORAGE_BUCKET: 'ci-simulator.invalid', VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef123456',
  VITE_API_BASE_URL: 'https://ci-simulator.invalid/api', VITE_API_BASE: 'https://ci-simulator.invalid/api',
  VITE_PAYMENTS_API_BASE_URL: 'https://ci-simulator.invalid/api/payments',
  VITE_FUNCTIONS_API_URL: 'https://ci-simulator.invalid/api',
  VITE_RAZORPAY_KEY_ID: 'rzp_test_ci_compile_only', VITE_PUSH_ENABLED: 'false', VITE_FCM_ENABLED: 'false'
};
writeFileSync('.env.staging', Object.entries(values).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n');
writeFileSync('.env', Object.entries(values).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n');
writeFileSync('ios/App/App/GoogleService-Info.plist', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>BUNDLE_ID</key><string>com.burgonomics</string>
<key>PROJECT_ID</key><string>ci-simulator</string>
<key>GOOGLE_APP_ID</key><string>1:1234567890:ios:abcdef123456abcd</string>
<key>GCM_SENDER_ID</key><string>1234567890</string>
<key>API_KEY</key><string>${FAKE_API_KEY}</string>
<key>PLIST_VERSION</key><string>1</string>
<key>IS_ADS_ENABLED</key><false/><key>IS_ANALYTICS_ENABLED</key><false/>
</dict></plist>`);
console.log('Explicit simulator compile fixture prepared; non-live, not distributable.');
