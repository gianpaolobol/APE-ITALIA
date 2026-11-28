import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesStagingHealth } from './verify-staging-health.mjs';
const revision = 'a'.repeat(40);
const valid = { status: 'ok', service: 'ape-italia-api', revision };
test('accepts a healthy API on the exact full revision', () => {
 assert.equal(matchesStagingHealth(JSON.stringify(valid), revision), true);
});
test('rejects missing, stale, invalid or truncated revision', () => {
 for (const value of [undefined, null, 'b'.repeat(40), revision.slice(0, 7)]) {
  assert.equal(matchesStagingHealth(JSON.stringify({ ...valid, revision: value }), revision), false);
 }
 assert.equal(matchesStagingHealth(JSON.stringify(valid), revision.slice(0, 7)), false);
});
test('rejects malformed JSON, other services and non-ok responses', () => {
 for (const body of ['<html>healthy</html>', 'null', '{}', JSON.stringify({ ...valid, service: 'other' }), JSON.stringify({ ...valid, status: 'error' })]) {
  assert.equal(matchesStagingHealth(body, revision), false);
 }
});

test('web gate rejects stale revisions, API responses and unknown service labels', () => {
 const web = { ...valid, service: 'ape-italia-web' };
 assert.equal(matchesStagingHealth(JSON.stringify(web), revision, 'ape-italia-web'), true);
 assert.equal(matchesStagingHealth(JSON.stringify(web), revision), false);
 assert.equal(matchesStagingHealth(JSON.stringify(valid), revision, 'ape-italia-web'), false);
 assert.equal(matchesStagingHealth(JSON.stringify({ ...web, revision: 'b'.repeat(40) }), revision, 'ape-italia-web'), false);
 assert.equal(matchesStagingHealth(JSON.stringify(web), revision, 'other'), false);
 assert.equal(matchesStagingHealth(JSON.stringify({ ...web, status: 'error' }), revision, 'ape-italia-web'), false);
});
