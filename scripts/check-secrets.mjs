// Catches credentials committed by accident. Not a substitute for care, but it
// would have caught every close call in this project's history.
import { execSync } from 'node:child_process';

const patterns = [
  [/postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/i, 'Postgres URL with a password'],
  [/\bnpg_[A-Za-z0-9]{12,}/, 'Neon password'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/, 'GitHub token'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'API secret key'],
];

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  // The example file carries deliberate placeholders.
  .filter((f) => f !== '.env.example' && !f.startsWith('docs/'));

let bad = false;
for (const file of files) {
  let content;
  try {
    content = execSync(`git show HEAD:"${file}"`, { encoding: 'utf8', maxBuffer: 20e6 });
  } catch {
    continue;
  }
  for (const [pattern, label] of patterns) {
    if (pattern.test(content)) {
      console.error(`${file}: looks like a ${label}`);
      bad = true;
    }
  }
}

if (bad) process.exit(1);
console.log(`Scanned ${files.length} tracked files, nothing that looks like a secret.`);
