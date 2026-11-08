import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function prepareConfig(env, platform) {
  if (!['android', 'ios'].includes(platform)) throw new Error('Expected platform android or ios');
  if (!env.MOBILE_PRODUCTION_ENV) throw new Error('Missing GitHub secret MOBILE_PRODUCTION_ENV (JSON VITE_* production values)');
  let values;
  try { values = JSON.parse(env.MOBILE_PRODUCTION_ENV); } catch { throw new Error('MOBILE_PRODUCTION_ENV must be a JSON object'); }
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('MOBILE_PRODUCTION_ENV must be a JSON object');
  if (values.VITE_APP_ENV !== 'production') throw new Error('MOBILE_PRODUCTION_ENV must set VITE_APP_ENV=production');
  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID', 'VITE_API_BASE_URL'];
  for (const key of required) if (typeof values[key] !== 'string' || !values[key].trim()) throw new Error(`MOBILE_PRODUCTION_ENV missing ${key}`);
  for (const [key, value] of Object.entries(values)) {
    if (!/^VITE_[A-Z0-9_]+$/.test(key) || typeof value !== 'string' || /[\r\n$]/.test(value)) throw new Error('MOBILE_PRODUCTION_ENV contains unsupported key/value syntax');
  }
  const api = new URL(values.VITE_API_BASE_URL);
  const host = api.hostname.replace(/\.+$/, '');
  const localOrPlaceholder = /(^|\.)(localhost|example(?:\.(?:com|org|net))?)$/.test(host)
    || /^127\./.test(host) || ['0.0.0.0', '[::]', '[::1]'].includes(host);
  if (api.protocol !== 'https:' || api.username || api.password || localOrPlaceholder) throw new Error('Production API must use a real HTTPS host without URL credentials');
  const secret = platform === 'android' ? 'GOOGLE_SERVICES_JSON_BASE64' : 'GOOGLE_SERVICE_INFO_PLIST_BASE64';
  if (!env[secret]) throw new Error(`Missing GitHub secret ${secret}`);
  const native = Buffer.from(env[secret], 'base64').toString('utf8');
  if (platform === 'android') {
    let config;
    try { config = JSON.parse(native); } catch { throw new Error('GOOGLE_SERVICES_JSON_BASE64 must decode to valid JSON'); }
    if (config.project_info?.project_id !== values.VITE_FIREBASE_PROJECT_ID || !config.client?.some(c => c.client_info?.android_client_info?.package_name === 'com.burgonomics')) throw new Error('Android Firebase project/package mismatch');
  } else {
    const bundle = native.match(/<key>BUNDLE_ID<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
    const project = native.match(/<key>PROJECT_ID<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
    if (!native.includes('<plist') || bundle !== 'com.burgonomics' || project !== values.VITE_FIREBASE_PROJECT_ID) throw new Error('Apple Firebase bundle/project mismatch');
  }
  return { dotenv: Object.entries(values).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n', native, nativePath: platform === 'android' ? 'android/app/google-services.json' : 'ios/App/App/GoogleService-Info.plist' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = prepareConfig(process.env, process.argv[2]);
    writeFileSync('.env.production', result.dotenv, { mode: 0o600 });
    writeFileSync('.env', result.dotenv, { mode: 0o600 });
    writeFileSync(result.nativePath, result.native, { mode: 0o600 });
    console.log('Native production configuration validated (no values logged).');
  } catch (error) { console.error(`::error::${error.message}`); process.exitCode = 1; }
}
