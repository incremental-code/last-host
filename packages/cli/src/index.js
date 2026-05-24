import { readFile } from 'node:fs/promises';
import { parseArgv } from './args.js';
import { createShellRunner } from './shell.js';
import { buildArtifact } from './build.js';
import { deployApp } from './deploy.js';

function printUsage(io) {
  io.stderr.write('usage: last-host <build|deploy> [flags]\n');
}

export async function run(argv, {
  cwd = process.cwd(),
  env = process.env,
  io = process,
  shell = createShellRunner(),
  fs = { readFile },
} = {}) {
  const { command, flags } = parseArgv(argv);

  if (command === 'build') {
    const result = await buildArtifact({
      cwd,
      app: flags.app,
      output: flags.output,
      shell,
      fs,
    });
    io.stdout.write(`artifact=${result.artifactPath}\n`);
    io.stdout.write(`releaseId=${result.releaseId}\n`);
    io.stdout.write(`app=${result.app}\n`);
    return result;
  }

  if (command === 'deploy') {
    const result = await deployApp({
      cwd,
      flags,
      env,
      shell,
      fs,
    });

    io.stdout.write(`artifact=${result.artifactPath}\n`);
    io.stdout.write(`releaseId=${result.releaseId}\n`);
    io.stdout.write(`app=${result.app}\n`);
    io.stdout.write(`url=${result.url}\n`);
    return result;
  }

  printUsage(io);
  throw new Error(`unknown command: ${command || '(empty)'}`);
}
