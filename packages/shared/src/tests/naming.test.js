import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appCanonicalId,
  appNameFromPackageJson,
  appNameFromPackageName,
  canonicalId,
  normalizeHostName,
  normalizeOrgName,
  validateHostName,
  validateOrgName,
} from '../naming.js';

test('appNameFromPackageName strips scope and normalizes', () => {
  assert.equal(appNameFromPackageName('@acme/My App'), 'my-app');
});

test('appNameFromPackageJson derives from name field', () => {
  assert.equal(appNameFromPackageJson({ name: '@scope/store_front' }), 'store-front');
});

test('org and host normalization are slug-safe', () => {
  assert.equal(normalizeOrgName(' Team One '), 'team-one');
  assert.equal(normalizeHostName('HOST_A.Example.COM'), 'host-a.example.com');
});

test('org and host validation reject invalid names', () => {
  assert.equal(validateOrgName('Org').ok, false);
  assert.equal(validateHostName('-edge').ok, false);
  assert.equal(validateOrgName('org-1').ok, true);
  assert.equal(validateHostName('lastjs.org').ok, true);
});

test('canonical IDs are stable and slug-safe', () => {
  assert.equal(canonicalId(' Acme ', 'Store Front', 'Host-A'), 'acme--store-front--host-a');
  assert.equal(appCanonicalId('Acme', 'Store Front'), 'acme--store-front');
});

test('validation enforces slug length bounds', () => {
  assert.equal(validateHostName('a'.repeat(63)).ok, true);
  assert.equal(validateHostName('a'.repeat(64)).ok, false);
  assert.equal(validateHostName(`a.${'b'.repeat(63)}.example.com`).ok, true);
});

test('canonicalId drops blank segments and package json fallback is safe', () => {
  assert.equal(canonicalId('Acme', '', 'Shop'), 'acme--shop');
  assert.equal(appNameFromPackageJson(null), '');
});
