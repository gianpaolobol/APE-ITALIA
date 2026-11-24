import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRelease } from './verify-release-ci.mjs';

const sha = 'a'.repeat(40);
const repository = 'owner/repo';
const valid = { id: 10, run_number: 4, run_attempt: 2, head_sha: sha, head_branch: 'main',
  event: 'push', head_repository: { full_name: repository }, status: 'completed', conclusion: 'success' };
const jobs = ['verify', 'containers', 'keycloak-e2e', 'clamav'].map(name => ({ name, status: 'completed', conclusion: 'success' }));
function fixture({ runs = [valid], results = jobs, main = sha, last = main, ...overrides } = {}) {
  let reads = 0;
  return { sha, repository, ref: 'refs/heads/main', event: 'workflow_dispatch', ...overrides,
    api: async path => {
      if (path === '/git/ref/heads/main') return { object: { sha: reads++ === 0 ? main : last } };
      if (path.startsWith('/actions/workflows/ci.yml/runs?')) {
        const q = new URLSearchParams(path.split('?')[1]);
        assert.equal(q.get('head_sha'), sha);
        assert.equal(q.get('event'), 'push');
        return { workflow_runs: runs };
      }
      assert.equal(path, '/actions/runs/10/attempts/2/jobs?per_page=100');
      return { jobs: results };
    } };
}
test('accept exact current main and four successful jobs', async () => {
  assert.equal(await verifyRelease(fixture()), 10);
});
test('reject tag, feature branch, push and old SHA', async () => {
  for (const overrides of [{ ref: 'refs/tags/mobile-v1' }, { ref: 'refs/heads/feature' },
    { event: 'push' }, { main: 'b'.repeat(40) }]) {
    await assert.rejects(verifyRelease(fixture(overrides)));
  }
});
test('reject missing, PR, foreign, other SHA, pending and failed runs', async () => {
  for (const runs of [[], [{ ...valid, event: 'pull_request' }],
    [{ ...valid, head_repository: { full_name: 'other/repo' } }],
    [{ ...valid, head_sha: 'b'.repeat(40) }],
    [valid, { ...valid, run_number: 5, status: 'queued', conclusion: null }],
    [{ ...valid, conclusion: 'failure' }]]) {
    await assert.rejects(verifyRelease(fixture({ runs })));
  }
});
test('reject missing, skipped, failed and duplicate required jobs', async () => {
  for (const results of [jobs.slice(1), [{ ...jobs[0], conclusion: 'skipped' }, ...jobs.slice(1)],
    [{ ...jobs[0], conclusion: 'failure' }, ...jobs.slice(1)], [...jobs, jobs[0]]]) {
    await assert.rejects(verifyRelease(fixture({ results })));
  }
});
test('reject changed main and unavailable API', async () => {
  await assert.rejects(verifyRelease(fixture({ last: 'b'.repeat(40) })));
  await assert.rejects(verifyRelease({ ...fixture(), api: async () => { throw new Error('network'); } }));
});
