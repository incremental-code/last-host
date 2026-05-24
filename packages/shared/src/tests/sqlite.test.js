import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIGRATIONS,
  V1_MIGRATION,
  V2_MIGRATION,
  V3_MIGRATION,
  V4_MIGRATION,
  V5_MIGRATION,
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
    MIGRATIONS.reduce((count, migration) => count + migration.statements.length + 1, 0),
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
  assert.equal(
    calls.length,
    MIGRATIONS.filter((migration) => migration.version > 1).reduce((count, migration) => count + migration.statements.length + 1, 0),
  );
  assert.match(calls.at(0), /CREATE TABLE IF NOT EXISTS app_runtime/);
});

test('v3 migration includes routing table', () => {
  const sql = V3_MIGRATION.statements.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app_routes/);
});

test('v4 migration includes port unique index and env table', () => {
  const sql = V4_MIGRATION.statements.join('\n');
  assert.match(sql, /idx_app_runtime_port/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app_env/);
});

test('v5 migration expands route mode support to custom', () => {
  const sql = V5_MIGRATION.statements.join('\n');
  assert.match(sql, /CHECK\(route_mode IN \('subdomain', 'path', 'custom', 'both'\)\)/);
  assert.match(sql, /ALTER TABLE app_routes RENAME TO app_routes_v3_backup/);
});

test('migrate rejects non-function execute', async () => {
  await assert.rejects(() => migrate({ execute: null }), /execute must be a function/);
});

test('latest schema version reports migration max', () => {
  assert.equal(latestSchemaVersion(), 5);
});
