import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function createShellRunner() {
  return {
    async run(command, args = [], options = {}) {
      const { cwd, env } = options;
      const { stdout = '', stderr = '' } = await execFileAsync(command, args, {
        cwd,
        env,
        encoding: 'utf8',
      });
      return { stdout, stderr };
    },
  };
}
