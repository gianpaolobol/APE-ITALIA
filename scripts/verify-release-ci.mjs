import { pathToFileURL } from 'node:url';

const requiredJobs = ['verify', 'containers', 'keycloak-e2e', 'clamav'];

export async function verifyRelease({ api, sha, ref, event, repository }) {
  if (ref !== 'refs/heads/main' || event !== 'workflow_dispatch' || !/^[0-9a-f]{40}$/.test(sha ?? '')) {
    throw new Error('Release requires manual dispatch on main at a full SHA');
  }
  const main = await api('/git/ref/heads/main');
  if (main.object?.sha !== sha) throw new Error('Release SHA is not current main');
  const query = new URLSearchParams({ head_sha: sha, branch: 'main', event: 'push', per_page: '100' });
  const runs = await api('/actions/workflows/ci.yml/runs?' + query);
  const candidates = (runs.workflow_runs ?? []).filter(run =>
    run.head_sha === sha && run.head_branch === 'main' && run.event === 'push' &&
    run.head_repository?.full_name === repository);
  // Do not fall back to an older successful attempt when the newest one is pending or failed.
  const run = candidates.sort((a, b) => b.run_number - a.run_number)[0];
  if (!run || run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error('No successful latest main push CI for this SHA');
  }
  const jobs = await api('/actions/runs/' + run.id + '/attempts/' + run.run_attempt + '/jobs?per_page=100');
  for (const name of requiredJobs) {
    const matches = (jobs.jobs ?? []).filter(job => job.name === name);
    if (matches.length !== 1 || matches[0].status !== 'completed' || matches[0].conclusion !== 'success') {
      throw new Error('Missing or unsuccessful required job: ' + name);
    }
  }
  const current = await api('/git/ref/heads/main');
  if (current.object?.sha !== sha) throw new Error('main changed during verification');
  return run.id;
}

async function main() {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_REF, GITHUB_EVENT_NAME, GITHUB_API_URL } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !GITHUB_API_URL) throw new Error('GitHub API configuration missing');
  const api = async path => {
    const response = await fetch(GITHUB_API_URL + '/repos/' + GITHUB_REPOSITORY + path, {
      headers: { Authorization: 'Bearer ' + GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('GitHub API gate failed: HTTP ' + response.status);
    return response.json();
  };
  const id = await verifyRelease({ api, sha: GITHUB_SHA, ref: GITHUB_REF, event: GITHUB_EVENT_NAME, repository: GITHUB_REPOSITORY });
  console.log('Validated main push CI run ' + id + ' at ' + GITHUB_SHA);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
