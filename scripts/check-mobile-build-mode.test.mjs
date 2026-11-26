import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMobileTestConfig } from './verify-mobile-test-config.mjs';

const workflow = readFileSync(new URL('../.github/workflows/mobile-release.yml', import.meta.url), 'utf8');
const steps = [...workflow.matchAll(/^      - name: (.+)\n([\s\S]*?)(?=^      - |^  [\w-]+:|$(?![\s\S]))/gm)];
const step = name => {
 const result = steps.find(s => s[1] === name);
 assert.ok(result, 'missing step: ' + name);
 return result[2];
};

test('build-only is the explicit default and public API settings are absent in that mode', () => {
 assert.match(workflow, /options: \[build-only, distribute\]\n\s+default: build-only/);
 for (const key of ['EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_OIDC_ISSUER', 'EXPO_PUBLIC_OIDC_CLIENT_ID', 'EXPO_PUBLIC_OIDC_AUDIENCE']) {
  assert.ok(workflow.includes(key + ": ${{ inputs.mode == 'distribute' && vars." + key + " || '' }}"));
 }
});

test('all external distribution and Apple signing steps require explicit distribute mode', () => {
 for (const name of ['Firebase configuration (keyless)', 'Google authentication via Workload Identity Federation', 'Distribute APK with Firebase App Distribution (keyless)', 'Distribute APK with Firebase App Distribution (service account key)', 'Upload to Google Play (internal testing)', 'App Store Connect API key', 'Archive (automatic signing via API key)', 'Export and upload to TestFlight']) {
  assert.match(step(name), /^        if: inputs\.mode == 'distribute'(?: && .*|)$/m);
 }
 assert.match(step('Upload to Google Play (internal testing)'), /^          track: internal$/m);
 assert.match(step('Export and upload to TestFlight'), /<key>destination<\/key><string>upload<\/string>/);
});

test('build-only suppresses signing configuration and compiles both platforms after release gate', () => {
 for (const flag of ['HAS_KEYSTORE', 'HAS_PLAY', 'HAS_FIREBASE', 'HAS_ASC']) {
  assert.ok(workflow.includes(flag + ": ${{ inputs.mode == 'distribute' && "));
 }
 for (const key of ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) {
  assert.ok(workflow.includes(key + ": ${{ inputs.mode == 'distribute' && secrets." + key + " || '' }}"));
 }
 assert.match(step('Compile for simulator (verification without signing)'), /if: env\.HAS_ASC != 'true'/);
 assert.match(step('Compile for simulator (verification without signing)'), /CODE_SIGNING_ALLOWED=NO/);
 assert.match(step('Build release bundle (AAB, Google Play) and APK (Firebase App Distribution)'), /bundleRelease assembleRelease/);
 assert.equal([...workflow.matchAll(/^    needs: release-gate$/gm)].length, 2);
});

test('explicit distribution fails early instead of reporting an unsigned build as distribution', () => {
 const android = step('Require Android test distribution configuration');
 assert.match(android, /^        if: inputs\.mode == 'distribute'$/m);
 assert.ok(android.includes('No Android test distribution destination is configured'));
 assert.ok(android.includes('Play internal is configured but the upload key is missing'));
 const ios = step('Require TestFlight configuration');
 assert.match(ios, /^        if: inputs\.mode == 'distribute' && env\.HAS_ASC != 'true'$/m);
 assert.match(ios, /exit 1/);
 assert.ok(workflow.indexOf('Require Android test distribution configuration') < workflow.indexOf('Build release bundle (AAB'));
 assert.ok(workflow.indexOf('Require TestFlight configuration') < workflow.indexOf('Xcode 26 ('));
 assert.match(step('Firebase configuration (keyless)'), /jq -er/);
 assert.match(step('Firebase configuration (keyless)'), /set -euo pipefail/);
});


test('public GitHub artifacts contain only demo build-only Android packages', () => {
 const uploads = [...workflow.matchAll(/^      - uses: actions\/upload-artifact@v4\n([\s\S]*?)(?=^      - |^  [\w-]+:|$(?![\s\S]))/gm)];
 assert.equal(uploads.length, 2);
 for (const upload of uploads) {
  assert.match(upload[1], /^        if: inputs\.mode == 'build-only'$/m);
  assert.match(upload[1], /^          if-no-files-found: error$/m);
 }
 assert.ok(workflow.includes('Nessun APK/AAB di distribuzione pubblicato come artifact GitHub.'));
});

const staging = { api: 'https://api-staging.example.test', expectedApi: 'https://api-staging.example.test',
 issuer: '', expectedIssuer: '', clientId: '', audience: '' };
test('connected mobile distribution accepts only the explicitly configured staging origin', () => {
 assert.doesNotThrow(() => validateMobileTestConfig(staging));
 for (const overrides of [{ api: '' }, { expectedApi: '' }, { api: 'https://api.example.test', expectedApi: 'https://api.example.test' },
  { api: 'https://api-staging.example.test/' }, { api: 'http://api-staging.example.test' }, { api: 'https://other-staging.example.test' },
  { api: 'https://api-staging.example.test@evil.test' }, { api: 'https://api-staging.example.test?x=1' }]) {
  assert.throws(() => validateMobileTestConfig({ ...staging, ...overrides }));
 }
});
test('optional OIDC settings must be complete and point to the expected staging issuer', () => {
 const oidc = { ...staging, issuer: 'https://auth-staging.example.test/realms/ape', expectedIssuer: 'https://auth-staging.example.test/realms/ape', clientId: 'ape-mobile', audience: 'ape-api' };
 assert.doesNotThrow(() => validateMobileTestConfig(oidc));
 for (const overrides of [{ clientId: '' }, { audience: '' }, { expectedIssuer: '' }, { issuer: 'https://auth.example.test/realms/ape', expectedIssuer: 'https://auth.example.test/realms/ape' },
  { issuer: 'https://auth-staging.example.test/../ape', expectedIssuer: 'https://auth-staging.example.test/../ape' }, { issuer: 'https://auth-staging.example.test/realms/other' }, { clientId: 'a b' }]) {
  assert.throws(() => validateMobileTestConfig({ ...oidc, ...overrides }));
 }
});
test('both native jobs validate staging before prebuild and signing, without blocking build-only', () => {
 const matches = [...workflow.matchAll(/^      - name: Verify staging-only mobile configuration\n([\s\S]*?)(?=^      - |^  [\w-]+:|$(?![\s\S]))/gm)];
 assert.equal(matches.length, 2);
 for (const m of matches) {
  assert.match(m[1], /^        if: inputs\.mode == 'distribute'$/m);
  assert.ok(m[1].includes('bash scripts/verify-mobile-staging.sh'));
  assert.ok(workflow.indexOf('Native project (expo prebuild)', m.index) > m.index);
 }
});

test('live staging preflight requires verified TLS, HTTP 200 and the full expected revision', () => {
 const script = readFileSync(new URL('./verify-mobile-staging.sh', import.meta.url), 'utf8');
 assert.match(script, /set -euo pipefail/);
 assert.match(script, /node scripts\/verify-mobile-test-config\.mjs/);
 assert.match(script, /--proto '=https'/);
 assert.match(script, /--max-time 15/);
 assert.match(script, /--max-filesize 65536/);
 assert.doesNotMatch(script, /(?:--insecure|--location|(?:^|\s)-[kL](?:\s|$))/m);
 assert.match(script, /"\$status" != 200/);
 assert.match(script, /node scripts\/verify-staging-health\.mjs "\$\{GITHUB_SHA:\?Missing expected build revision\}" < "\$body"/);
 assert.match(script, /trap 'rm -f "\$body"' EXIT/);
});
