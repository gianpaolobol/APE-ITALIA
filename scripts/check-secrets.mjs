#!/usr/bin/env node
/**
 * Lightweight secret scan over tracked files (public repository). Fails CI on likely credentials.
 * Not a substitute for a dedicated scanner, but it runs offline and without third-party actions.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const RULES = [
 ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
 ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
 ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
 ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
 ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
 ['Stripe live key', /\b[sr]k_live_[0-9A-Za-z]{20,}\b/],
 ['Anthropic/OpenAI key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/],
 ['signed JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b/],
 ['credential in URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:(?!ci_only_password@|local_dev_only@)[^\s@/]{6,}@/i],
];
const ALLOWED_FILES = [/^package-lock\.json$/];
const FORBIDDEN_PATHS = [/(^|\/)\.env(?!\.example$)(\.|$)/, /\.(pem|p12|pfx|key)$/i, /(^|\/)credentials\.json$/];

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const findings = [];
for (const f of files) {
 if (FORBIDDEN_PATHS.some(r => r.test(f))) { findings.push(`${f}: forbidden file type in public repository`); continue; }
 if (ALLOWED_FILES.some(r => r.test(f))) continue;
 let st; try { st = statSync(f); } catch { continue; }
 if (!st.isFile() || st.size > 2_000_000) continue;
 const text = readFileSync(f, 'utf8');
 if (text.includes('\0')) continue; // binary
 text.split('\n').forEach((line, i) => {
  for (const [name, re] of RULES) if (re.test(line)) findings.push(`${f}:${i + 1}: possible ${name}`);
 });
}
if (findings.length) {
 console.error('Secret scan failed:\n' + findings.join('\n'));
 process.exit(1);
}
console.log(`Secret scan passed (${files.length} tracked files).`);
