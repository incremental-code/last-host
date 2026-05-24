import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createShellRunner } from '../shell.js';

test('shell runner respects cwd', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'last-host-shell-'));
  await writeFile(path.join(cwd, 'marker.txt'), 'ok\n', 'utf8');

  const shell = createShellRunner();
  const result = await shell.run('sh', ['-lc', 'cat marker.txt'], { cwd });

  assert.equal(result.stdout.trim(), 'ok');
});
