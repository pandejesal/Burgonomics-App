// Manual client-demo lane only. No production keys, signing or store submission.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PROJECT = 'burgonomics-7faa8';
const API = `https://asia-south1-${PROJECT}.cloudfunctions.net/api`;
const ALIASES = ['VITE_API_BASE_URL', 'VITE_API_BASE', 'VITE_FUNCTIONS_API_URL'];

export function prepareDemoConfig(env, bundleId) {
  if (!['com.burgonomics', 'com.burgonomics.partner'].includes(bundleId)) throw new Error('Unknown demo bundle');
  if (!env.MOBILE_STAGING_ENV) throw new Error('Missing MOBILE_STAGING_ENV');
  let values;
  try { values = JSON.parse(env.MOBILE_STAGING_ENV); } catch { throw new Error('MOBILE_STAGING_ENV must be a JSON object'); }
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('MOBILE_STAGING_ENV must be a JSON object');
  if (values.VITE_APP_ENV !== 'staging' || values.VITE_FIREBASE_PROJECT_ID !== PROJECT) throw new Error('Demo must use the designated staging project');
  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID', 'VITE_API_BASE_URL', 'VITE_RAZORPAY_KEY_ID'];
  for (const key of required) if (typeof values[key] !== 'string' || !values[key].trim()) throw new Error(`Staging config missing ${key}`);
  for (const [key, value] of Object.entries(values)) {
    if (!/^VITE_[A-Z0-9_]+$/.test(key) || typeof value !== 'string' || /[\r\n$]/.test(value)) throw new Error('Unsupported staging key/value syntax');
    if (/MOCK/.test(key) && !['false', '0', ''].includes(value)) throw new Error('Demo may not enable mocks');
    if (/rzp_live_/.test(value)) throw new Error('Live payment key forbidden in demo');
  }
  if (!/^rzp_test_[A-Za-z0-9_]+$/.test(values.VITE_RAZORPAY_KEY_ID)) throw new Error('Demo requires a Razorpay test key');
  for (const key of ALIASES) if (values[key] && values[key] !== API) throw new Error('Demo API must be the designated staging endpoint');
  if (values.VITE_PAYMENTS_API_BASE_URL && values.VITE_PAYMENTS_API_BASE_URL !== `${API}/payments`) throw new Error('Demo payments API must use staging');
  const secret = env.STAGING_GOOGLE_SERVICE_INFO_PLIST_BASE64;
  if (!secret) throw new Error('Missing STAGING_GOOGLE_SERVICE_INFO_PLIST_BASE64');
  const native = Buffer.from(secret, 'base64').toString('utf8');
  const field = key => native.match(new RegExp(`<key>\\s*${key}\\s*</key>\\s*<string>([^<]+)</string>`))?.[1];
  if (!native.includes('<plist') || field('BUNDLE_ID') !== bundleId || field('PROJECT_ID') !== PROJECT ||
      field('GCM_SENDER_ID') !== values.VITE_FIREBASE_MESSAGING_SENDER_ID || !/^A[\w-]{38}$/.test(field('API_KEY') || '') ||
      !field('GOOGLE_APP_ID')?.includes(':ios:')) throw new Error('Native staging Firebase configuration mismatch');
  // Push/APNs needs physical-device verification; it is not claimed by this lane.
  const configured = { ...values, ...Object.fromEntries(ALIASES.map(key => [key, API])), VITE_PAYMENTS_API_BASE_URL: `${API}/payments`, VITE_PUSH_ENABLED: 'false', VITE_FCM_ENABLED: 'false' };
  return { dotenv: Object.entries(configured).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', native };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'macOS' || process.env.CI_SIMULATOR_ONLY !== 'true') throw new Error('Demo configuration is restricted to the manual macOS simulator lane');
    const name = JSON.parse(readFileSync('package.json', 'utf8')).name;
    const bundleId = name === 'burgonomics-partner' ? 'com.burgonomics.partner' : name === 'burgonomics' ? 'com.burgonomics' : '';
    const result = prepareDemoConfig(process.env, bundleId);
    writeFileSync('.env.staging', result.dotenv, { mode: 0o600 });
    writeFileSync('.env', result.dotenv, { mode: 0o600 });
    writeFileSync('ios/App/App/GoogleService-Info.plist', result.native, { mode: 0o600 });
    console.log('Real staging demo configuration validated; push unverified, no values logged.');
  } catch (error) { console.error(`::error::${error.message}`); process.exitCode = 1; }
}
