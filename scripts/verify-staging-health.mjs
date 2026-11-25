import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function matchesStagingHealth(body, expected) {
 if (typeof expected !== 'string' || !/^[a-f0-9]{40}$/.test(expected)) return false;
 try {
  const value = JSON.parse(body);
  return value?.status === 'ok' && value.service === 'ape-italia-api' && value.revision === expected;
 } catch { return false; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 if (!matchesStagingHealth(readFileSync(0, 'utf8'), process.argv[2])) {
  // Never echo the remote response (it may not be our service).
  console.error('Staging health response does not match the expected API revision');
  process.exitCode = 1;
 }
}
