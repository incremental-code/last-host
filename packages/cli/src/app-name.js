import path from 'node:path';
import { appNameFromPackageName, normalizeAppName } from '@incremental-code/last-host-shared';

export async function readPackageJson(cwd, { fs }) {
  const packageJsonPath = path.join(cwd, 'package.json');
  const raw = await fs.readFile(packageJsonPath, 'utf8');
  return JSON.parse(raw);
}

export function resolveAppName({ app, packageJson }) {
  const fromFlag = normalizeAppName(app || '');
  if (fromFlag) return fromFlag;

  const fromPackage = appNameFromPackageName(packageJson?.name || '');
  if (fromPackage) return fromPackage;

  throw new Error('unable to resolve app name (provide --app or package.json name)');
}
