import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAasa } from './generate-aasa.mjs';
test('no team means no publishable association document', () => assert.equal(generateAasa(''), null));
test('placeholder and malformed team IDs cannot publish', () => {
 for (const id of ['TEAMID', 'bad team', '123']) assert.throws(() => generateAasa(id), /TEAM_ID/);
});
test('real team binds only the intended bundle', () => {
 const data = generateAasa('AB12CD34EF');
 assert.ok(JSON.stringify(data).includes('AB12CD34EF.com.burgonomics'));
 assert.equal(JSON.stringify(data).includes('TEAMID'), false);
});
