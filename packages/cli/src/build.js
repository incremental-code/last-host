import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { readPackageJson, resolveAppName } from './app-name.js';

function createReleaseId(now = Date.now()) {
  const timestamp = now.toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

export async function buildArtifact({
  cwd,
  app,
  output,
  shell,
  fs,
  now = Date.now,
}) {
  const packageJson = await readPackageJson(cwd, { fs });
  const resolvedApp = resolveAppName({ app, packageJson });
  const releaseId = createReleaseId(now());
  const artifactsDir = path.join(cwd, '.last-host', 'artifacts');

  await mkdir(artifactsDir, { recursive: true });

  if (packageJson?.scripts?.build) {
    await shell.run('npm', ['run', 'build'], { cwd });
  }

  const artifactPath = output
    ? path.resolve(cwd, output)
    : path.join(artifactsDir, `${resolvedApp}-${releaseId}.tar.gz`);

  await shell.run(
    'tar',
    [
      '-czf',
      artifactPath,
      '--exclude',
      '.git',
      '--exclude',
      'node_modules',
      '--exclude',
      '.last-host',
      '-C',
      cwd,
      '.',
    ],
    { cwd },
  );

  return {
    app: resolvedApp,
    releaseId,
    artifactPath,
  };
}
