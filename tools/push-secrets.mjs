// Uploads worker/.dev.vars (KEY=value lines) as Worker secrets via `wrangler secret bulk`.
// The JSON copy wrangler needs is written to the OS temp dir and deleted afterwards.
// Run from the repo root: node tools/push-secrets.mjs
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const workerDir = new URL('../worker/', import.meta.url);
const vars = {};
for (const line of readFileSync(new URL('.dev.vars', workerDir), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0) vars[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const tmp = join(tmpdir(), `forge-secrets-${process.pid}.json`);
writeFileSync(tmp, JSON.stringify(vars));
try {
  execSync(`npx wrangler secret bulk "${tmp}"`, { cwd: workerDir, stdio: 'inherit' });
} finally {
  rmSync(tmp, { force: true });
}
