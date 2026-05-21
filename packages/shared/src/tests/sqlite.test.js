import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  V1_MIGRATION,
  V2_MIGRATION,
  V3_MIGRATION,
  latestSchemaVersion,
  migrate,
  schemaStatementsForVersion,
} from '../sqlite.js';

test('v1 migration includes required tables', () => {
  const sql = V1_MIGRATION.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS apps/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS releases/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS domains/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS hosts/);
});

test('schema statements return copy for v1', () => {
  const statements = schemaStatementsForVersion(1);
  assert.equal(statements.length, V1_MIGRATION.statements.length);
  statements.pop();
  assert.equal(V1_MIGRATION.statements.length > statements.length, true);
});

test('v2 migration includes runtime table', () => {
  const sql = V2_MIGRATION.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app_runtime/);
});

test('migrate executes statements and inserts migration record', async () => {
  const calls = [];
  await migrate({
    execute: async (statement) => {
      calls.push(statement);
    },
    fromVersion: 0,
  });
  assert.equal(
    calls.length,
    V1_MIGRATION.statements.length + V2_MIGRATION.statements.length + V3_MIGRATION.statements.length + 3,
  );
  assert.match(calls.at(-1), /INSERT OR REPLACE INTO schema_migrations/);
});

test('migrate only runs newer migrations', async () => {
  const calls = [];
  await migrate({
    execute: async (statement) => {
      calls.push(statement);
    },
    fromVersion: 1,
  });
  assert.equal(calls.length, V2_MIGRATION.statements.length + V3_MIGRATION.statements.length + 2);
  assert.match(calls.at(0), /CREATE TABLE IF NOT EXISTS app_runtime/);
});

test('v3 migration includes routing table', () => {
  const sql = V3_MIGRATION.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app_routes/);
});

test('migrate rejects non-function execute', async () => {
  await assert.rejects(() => migrate({ execute: null }), /execute must be a function/);
});

test('latest schema version reports migration max', () => {
  assert.equal(latestSchemaVersion(), 3);
});
