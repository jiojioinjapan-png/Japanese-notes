import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolveRun() : reject(new Error(`Test server command exited with ${code}`)),
    );
  });
}
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
// Clear only the dedicated disposable E2E database. Development D1 is untouched.
await rm(resolve(root, '.wrangler/e2e'), { recursive: true, force: true });
await run(process.execPath, [
  wrangler,
  'd1',
  'migrations',
  'apply',
  'DB',
  '--local',
  '--persist-to',
  '.wrangler/e2e',
]);
await run(process.execPath, [
  wrangler,
  'dev',
  '--port',
  '8788',
  '--persist-to',
  '.wrangler/e2e',
  '--var',
  'ADMIN_TOKEN:e2e-test-import-key',
]);
