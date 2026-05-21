import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { releaseDir, releaseLayout, releasePaths } from '../release-paths.js';

test('release layout returns atomic deployment directories', () => {
  const layout = releaseLayout('/srv/apps/acme--store');
  assert.deepEqual(layout, {
    rootDir: '/srv/apps/acme--store',
    releasesDir: '/srv/apps/acme--store/releases',
    currentLink: '/srv/apps/acme--store/current',
    sharedDir: '/srv/apps/acme--store/shared',
  });
});

test('releaseDir normalizes release id', () => {
  assert.equal(
    releaseDir('/srv/apps/acme--store', ' Release_001 '),
    path.join('/srv/apps/acme--store', 'releases', 'release_001'),
  );
});

test('releasePaths includes normalized release id and path', () => {
  const paths = releasePaths('/srv/apps/acme--store', '2026.05.18+1');
  assert.equal(paths.releaseId, '2026.05.18-1');
  assert.equal(paths.releaseDir, '/srv/apps/acme--store/releases/2026.05.18-1');
});
