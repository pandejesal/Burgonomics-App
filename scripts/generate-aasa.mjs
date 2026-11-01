import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function generateAasa(teamId) {
  if (!teamId) return null;
  if (!/^[A-Z0-9]{10}$/.test(teamId) || /TEAMID|PLACEHOLDER/.test(teamId)) throw new Error('TEAM_ID must be the real 10-character Apple application-identifier prefix');
  return { applinks: { apps: [], details: [{ appID: `${teamId}.com.burgonomics`, paths: ["/orders/*", "/menu/*", "/profile/*"] }] } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = 'public/.well-known/apple-app-site-association';
  // Remove stale output before validation; a failed build never leaves fake data.
  rmSync(target, { force: true });
  const document = generateAasa(process.env.TEAM_ID);
  if (document) {
    mkdirSync('public/.well-known', { recursive: true });
    writeFileSync(target, JSON.stringify(document, null, 2) + '\n');
  } else console.log('TEAM_ID unset: Apple association file omitted.');
}
