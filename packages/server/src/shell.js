import { spawn } from 'node:child_process';

export function createShellRunner() {
  return {
    async run(command, args = [], options = {}) {
      return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          stdio: 'pipe',
          cwd: options.cwd || undefined,
          env: options.env ? { ...process.env, ...options.env } : process.env,
        });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on('data', (chunk) => {
          stderr += String(chunk);
        });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0) {
            resolve({ stdout, stderr });
            return;
          }
          reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
        });

        if (options.stdin) {
          child.stdin.write(options.stdin);
        }
        child.stdin.end();
      });
    },
  };
}
