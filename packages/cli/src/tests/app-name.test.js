import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveAppName } from '../app-name.js';

test('resolveAppName defaults from package name', () => {
  const name = resolveAppName({
    app: '',
    packageJson: { name: '@acme/Store Front' },
  });
  assert.equal(name, 'store-front');
});

test('resolveAppName prefers explicit --app override', () => {
  const name = resolveAppName({
    app: 'My_App',
    packageJson: { name: '@acme/ignored' },
  });
  assert.equal(name, 'my-app');
});
