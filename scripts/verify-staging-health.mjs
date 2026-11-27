import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function matchesStagingHealth(body, expected, service = 'ape-italia-api') {
 if (!['ape-italia-api', 'ape-italia-web'].includes(service)) return false;
 if (typeof expected !== 'string' || !/^[a-f0-9]{40}$/.test(expected)) return false;
 try {
  const value = JSON.parse(body);
  return value?.status === 'ok' && value.service === service && value.revision === expected;
 } catch { return false; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 if (!matchesStagingHealth(readFileSync(0, 'utf8'), process.argv[2], process.argv[3])) {
  // Never echo the remote response (it may not be our service).
  console.error('Staging health response does not match the expected service and revision');
  process.exitCode = 1;
 }
}
