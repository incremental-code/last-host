import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSqliteStore } from '../sqlite-store.js';

function createMockSqlShell() {
  const calls = [];
  return {
    calls,
    async run(command, args) {
      calls.push({ command, args });
      const sql = args.at(-1);
      if (String(sql).includes('nextRevision')) {
        return { stdout: '[{"nextRevision":1}]\n', stderr: '' };
      }
      if (String(sql).includes('SELECT id, hostname FROM hosts')) {
        return { stdout: '[{"id":"edge-a","hostname":"edge-a"}]\n', stderr: '' };
      }
      if (String(sql).includes('SELECT id, org, app, host_id FROM apps')) {
        return { stdout: '[{"id":"acme--shop","org":"acme","app":"shop","host_id":"edge-a"}]\n', stderr: '' };
      }
      if (String(sql).includes('SELECT app_id, entry_command')) {
        return { stdout: '[{"app_id":"acme--shop","entry_command":"node app/server.js","port":3100,"health_path":"/health","service_name":"last-host-acme-shop","active_release_id":"r1"}]\n', stderr: '' };
      }
      if (String(sql).includes('SELECT id FROM releases')) {
        return { stdout: '[{"id":"r1"}]\n', stderr: '' };
      }
      if (String(sql).includes('FROM apps a')) {
        return { stdout: '[{"org":"acme","app":"shop","port":3100,"custom_domain":""}]\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    },
  };
}

test('sqlite store emits sqlite3 commands and upserts runtime data', async () => {
  const shell = createMockSqlShell();
  const store = createSqliteStore({ dbPath: '/opt/last-host/state/runtime.sqlite', shell });

  await store.init();
  await store.upsertHost({ id: 'edge-a', hostname: 'edge-a' });
  const app = await store.upsertApp({ org: 'acme', app: 'shop', hostId: 'edge-a' });
  await store.upsertRuntime({
    appId: app.id,
    entryCommand: 'node app/server.js',
    port: 3100,
    healthPath: '/health',
    serviceName: 'last-host-acme-shop',
  });
  await store.upsertRelease({ releaseId: 'r1', appId: app.id, artifactRef: '/artifact.tar.gz', status: 'prepared' });
  await store.setActiveRelease({ appId: app.id, releaseId: 'r1' });
  await store.setDomains({ appId: app.id, defaultDomain: 'shop.acme.edge-a', customDomain: '' });

  assert.equal(shell.calls.length > 5, true);
  assert.equal(shell.calls.some((call) => call.command === 'sqlite3'), true);
  const executedSql = shell.calls.map((call) => call.args.at(-1)).join('\n');
  assert.match(executedSql, /UPDATE releases SET status='inactive'/);
  assert.match(executedSql, /DELETE FROM domains WHERE app_id='acme--shop' AND kind='custom'/);
});

test('setDomains normalizes and writes custom domain records', async () => {
  const shell = createMockSqlShell();
  const store = createSqliteStore({ dbPath: '/opt/last-host/state/runtime.sqlite', shell });

  await store.setDomains({
    appId: 'acme--shop',
    defaultDomain: 'shop.acme.edge-a',
    customDomain: ' Shop.ACME.com ',
  });

  const executedSql = shell.calls.map((call) => call.args.at(-1)).join('\n');
  assert.match(executedSql, /DELETE FROM domains WHERE app_id='acme--shop' AND kind='custom'/);
  assert.match(executedSql, /'shop.acme.com'/);
});
