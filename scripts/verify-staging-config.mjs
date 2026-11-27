import { pathToFileURL } from 'node:url';

// Only simple, literal public endpoint values are allowed in the staging dotenv.
function literal(envFile, key) {
  const lines = envFile.split(/\r?\n/).filter(line => new RegExp('^\\s*' + key + '(?:\\s*=|\\s*$)').test(line));
  if (lines.length !== 1 || !lines[0].startsWith(key + '=')) throw new Error('Missing or ambiguous ' + key);
  return lines[0].slice(key.length + 1);
}

export function validateStaging({ host, user, deployPath, expectedUrl, expectedWebUrl, envFile }) {
  // These strings also enter the SSH remote shell. Restrict to literal safe tokens.
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host ?? '')) throw new Error('Invalid staging SSH host');
  if (!/^[a-z_][a-z0-9_-]*$/.test(user ?? '') || user === 'root') throw new Error('Invalid staging SSH user');
  if (!/^\/opt\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(deployPath ?? '')) throw new Error('Invalid staging deployment path');
  // A dedicated staging DNS name is required, not a production or arbitrary URL.
  if (!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(expectedUrl ?? '')) throw new Error('Invalid staging HTTPS origin');
  const domain = new URL(expectedUrl).hostname;
  if (!domain.split('.').some(label => /(?:^|-)staging(?:-|$)/.test(label))) throw new Error('Staging DNS label required');
  if (typeof envFile !== 'string' || literal(envFile, 'PUBLIC_API_URL') !== expectedUrl ||
      literal(envFile, 'API_DOMAIN') !== domain) throw new Error('Staging endpoint configuration mismatch');
  if (!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(expectedWebUrl ?? '')) throw new Error('Invalid staging web HTTPS origin');
  const webDomain = new URL(expectedWebUrl).hostname;
  if (!webDomain.split('.').some(label => /(?:^|-)staging(?:-|$)/.test(label)) || webDomain === domain) throw new Error('Distinct staging web DNS required');
  if (literal(envFile, 'WEB_DOMAIN') !== webDomain || literal(envFile, 'WEB_BASE_URL') !== expectedWebUrl || literal(envFile, 'API_BASE_URL') !== expectedUrl) throw new Error('Staging web endpoint configuration mismatch');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { HOST, USER, DEPLOY_PATH, EXPECTED_URL, EXPECTED_WEB_URL, ENV_FILE } = process.env;
  try { validateStaging({ host: HOST, user: USER, deployPath: DEPLOY_PATH, expectedUrl: EXPECTED_URL, expectedWebUrl: EXPECTED_WEB_URL, envFile: ENV_FILE }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
