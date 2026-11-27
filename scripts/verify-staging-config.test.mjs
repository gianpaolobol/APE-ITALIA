import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStaging } from './verify-staging-config.mjs';

const valid = { host: 'vm.example.test', user: 'deploy', deployPath: '/opt/ape-staging',
  expectedUrl: 'https://api-staging.example.test', expectedWebUrl: 'https://web-staging.example.test',
  envFile: 'API_DOMAIN=api-staging.example.test\nPUBLIC_API_URL=https://api-staging.example.test\nWEB_DOMAIN=web-staging.example.test\nWEB_BASE_URL=https://web-staging.example.test\nAPI_BASE_URL=https://api-staging.example.test\n' };
test('accept dedicated staging endpoint and safe SSH arguments', () => assert.doesNotThrow(() => validateStaging(valid)));
test('reject unsafe SSH arguments and non-staging origins', () => {
  for (const overrides of [{ host: '-oProxyCommand=x' }, { host: 'host;whoami' }, { user: 'root' },
    { user: 'a b' }, { deployPath: '/opt/../etc' }, { deployPath: "/opt/a'b" },
    { expectedUrl: 'http://api-staging.example.test' }, { expectedUrl: 'https://api.example.test' },
    { expectedUrl: 'https://api-staging.example.test/path' }, { expectedUrl: 'https://api-staging.example.test@evil.test' }]) {
    assert.throws(() => validateStaging({ ...valid, ...overrides }));
  }
});
test('reject missing, duplicated or mismatched public endpoint settings', () => {
  for (const envFile of ['', valid.envFile + ' PUBLIC_API_URL = https://other.test\n',
    valid.envFile.replace('API_DOMAIN=api-staging', 'API_DOMAIN=api'),
    valid.envFile.replace('https://api-staging', 'https://api'),
    valid.envFile.replace('PUBLIC_API_URL=https', 'PUBLIC_API_URL="https')]) {
    assert.throws(() => validateStaging({ ...valid, envFile }));
  }
});

test('web requires a distinct dedicated staging HTTPS host and matching literal URLs', () => {
  for (const expectedWebUrl of ['', 'http://web-staging.example.test', 'https://web.example.test', valid.expectedUrl, valid.expectedWebUrl + '/']) {
    assert.throws(() => validateStaging({ ...valid, expectedWebUrl }));
  }
  for (const envFile of [valid.envFile.replace('WEB_DOMAIN=', 'OTHER='), valid.envFile + ' WEB_DOMAIN = duplicate\n',
    valid.envFile.replace('WEB_BASE_URL=https://web-staging', 'WEB_BASE_URL=https://web'),
    valid.envFile.replace('API_BASE_URL=https://api-staging', 'API_BASE_URL=https://api')]) {
    assert.throws(() => validateStaging({ ...valid, envFile }));
  }
});

test('expected OIDC issuer is safe for remote shell and dedicated staging', () => {
  assert.doesNotThrow(() => validateStaging({ ...valid, expectedIssuer: 'https://auth-staging.example.test/realms/ape' }));
  for (const expectedIssuer of ['https://auth.example.test/realms/ape',
    'https://auth-staging.example.test/../ape', 'https://auth-staging.example.test/realms/ape?x=1',
    "https://auth-staging.example.test/realms/a'b", 'https://auth-staging.example.test/realms/$HOME']) {
    assert.throws(() => validateStaging({ ...valid, expectedIssuer }));
  }
});
