// Fails if lib/config.ts reads a variable that .env.example does not document,
// or documents one nothing reads. Both drift silently otherwise.
import { readFileSync } from 'node:fs';

const config = readFileSync('lib/config.ts', 'utf8');
const example = readFileSync('.env.example', 'utf8');

const declared = [...config.matchAll(/^  ([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]);
const documented = [...example.matchAll(/^#? ?([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);

const undocumented = declared.filter((k) => !documented.includes(k));
const unused = [...new Set(documented)].filter((k) => !declared.includes(k));

if (undocumented.length) console.error('Not documented in .env.example:', undocumented.join(', '));
if (unused.length) console.error('Documented but never read:', unused.join(', '));

if (undocumented.length || unused.length) process.exit(1);
console.log(`${declared.length} variables, all documented.`);
