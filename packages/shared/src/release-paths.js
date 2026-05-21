import path from 'node:path';

function normalizeReleaseId(releaseId) {
  if (typeof releaseId !== 'string') return '';
  return releaseId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function releaseLayout(rootDir) {
  return {
    rootDir,
    releasesDir: path.join(rootDir, 'releases'),
    currentLink: path.join(rootDir, 'current'),
    sharedDir: path.join(rootDir, 'shared'),
  };
}

export function releaseDir(rootDir, releaseId) {
  return path.join(releaseLayout(rootDir).releasesDir, normalizeReleaseId(releaseId));
}

export function releasePaths(rootDir, releaseId) {
  const layout = releaseLayout(rootDir);
  const normalizedReleaseId = normalizeReleaseId(releaseId);
  return {
    ...layout,
    releaseId: normalizedReleaseId,
    releaseDir: path.join(layout.releasesDir, normalizedReleaseId),
  };
}
