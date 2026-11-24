import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStaging } from './verify-staging-config.mjs';

const valid = { host: 'vm.example.test', user: 'deploy', deployPath: '/opt/ape-staging',
  expectedUrl: 'https://api-staging.example.test',
  envFile: 'API_DOMAIN=api-staging.example.test\nPUBLIC_API_URL=https://api-staging.example.test\n' };
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
