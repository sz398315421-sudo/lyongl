import { spawn } from 'node:child_process';

const root = process.cwd();
const viteArguments = ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', ...process.argv.slice(2)];
const serverArguments = ['node_modules/tsx/dist/cli.mjs', 'watch', 'server/index.ts'];
const client = spawn(process.execPath, viteArguments, { cwd: root, stdio: 'inherit' });
const server = spawn(process.execPath, serverArguments, { cwd: root, stdio: 'inherit' });
let closing = false;

function close(exitCode = 0) {
  if (closing) return;
  closing = true;
  client.kill();
  server.kill();
  process.exitCode = exitCode;
}

client.on('exit', code => close(code ?? 0));
server.on('exit', code => close(code ?? 0));
process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());
