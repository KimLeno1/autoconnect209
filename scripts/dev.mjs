import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apiPort = process.env.API_PORT || '4173';
const vitePort = process.env.PORT || '3000';

const apiServer = spawn(process.execPath, [join(root, 'server.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: apiPort,
  },
});

const viteServer = spawn(
  process.execPath,
  [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), `--port=${vitePort}`, '--host=0.0.0.0'],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
    },
  }
);

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!apiServer.killed) apiServer.kill('SIGTERM');
  if (!viteServer.killed) viteServer.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300).unref();
}

apiServer.on('exit', code => {
  if (!shuttingDown) shutdown(code ?? 1);
});

viteServer.on('exit', code => {
  if (!shuttingDown) shutdown(code ?? 1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
