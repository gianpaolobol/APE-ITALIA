import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

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
