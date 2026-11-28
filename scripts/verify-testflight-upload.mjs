import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function verifyTestFlightUpload(run, jobs, sha) {
 if (!/^[a-f0-9]{40}$/.test(sha) || run?.head_sha !== sha ||
     run.head_branch !== 'main' || run.path !== '.github/workflows/mobile-release.yml' ||
     run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success' ||
     !Number.isSafeInteger(run.run_number) || run.run_number < 1) {
  throw new Error('Expected successful explicit Mobile release on exact main revision');
 }
 const ios = Array.isArray(jobs?.jobs) ? jobs.jobs.filter(j => j.name === 'ios') : [];
 if (ios.length !== 1 || ios[0].status !== 'completed' || ios[0].conclusion !== 'success' ||
     !Array.isArray(ios[0].steps) || !ios[0].steps.some(s =>
       s.name === 'Export and upload to TestFlight' && s.status === 'completed' && s.conclusion === 'success')) {
  throw new Error('No successful signed TestFlight upload in selected run');
 }
 return String(run.run_number);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try {
  const [, , run, jobs, sha] = process.argv;
  console.log(verifyTestFlightUpload(JSON.parse(readFileSync(run, 'utf8')), JSON.parse(readFileSync(jobs, 'utf8')), sha));
 } catch (error) { console.error(error.message); process.exitCode = 1; }
}
