import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHostRuntime } from '../runtime.js';

function createMockShell() {
  const calls = [];
  return {
    calls,
    async run(command, args, options = {}) {
      calls.push({ command, args, options });
      return { stdout: '', stderr: '' };
    },
  };
}

function createMockStore() {
  const apps = new Map();
  const runtimes = new Map();
  const releases = new Map();
  const domains = new Map();
  const hosts = new Map();
  const routes = new Map();

  return {
    async init() {},
    async upsertHost(host) {
      hosts.set(host.id, host);
      return host;
    },
    async getHostById(id) { return hosts.get(id) || { id, hostname: id }; },
    async upsertApp({ org, app, hostId }) {
      const id = `${org}--${app}`;
      const value = { id, org, app, host_id: hostId };
      apps.set(id, value);
      return value;
    },
    async getApp(org, app) { return apps.get(`${org}--${app}`) || null; },
    async upsertRuntime(runtime) { runtimes.set(runtime.appId, { ...runtime, service_name: runtime.serviceName, entry_command: runtime.entryCommand, active_release_id: runtime.activeReleaseId || '' }); },
    async getRuntime(appId) { return runtimes.get(appId) || null; },
    async getRouting(appId) { return routes.get(appId) || null; },
    async upsertRouting({ appId, routeMode, basePath }) {
      routes.set(appId, { route_mode: routeMode, base_path: basePath });
    },
    async upsertRelease({ appId, releaseId }) { releases.set(`${appId}:${releaseId}`, { appId, releaseId }); },
    async setActiveRelease({ appId, releaseId }) {
      const current = runtimes.get(appId);
      runtimes.set(appId, { ...current, active_release_id: releaseId });
    },
    async findRollbackRelease(appId, currentReleaseId) {
      const ids = [...releases.values()].filter((x) => x.appId === appId && x.releaseId !== currentReleaseId).map((x) => x.releaseId);
      return ids.at(-1) || null;
    },
    async setDomains({ appId, customDomain }) {
      domains.set(appId, customDomain);
    },
    async listCaddyApps(hostId) {
      return [...apps.values()]
        .filter((app) => app.host_id === hostId)
        .map((app) => ({
          org: app.org,
          app: app.app,
          port: runtimes.get(app.id)?.port || 3000,
          route_mode: routes.get(app.id)?.route_mode || 'subdomain',
          base_path: routes.get(app.id)?.base_path || '',
          custom_domain: domains.get(app.id) || '',
        }));
    },
  };
}

test('prepare + activate release calls tar, systemctl and caddy reload via shell', async () => {
  const shell = createMockShell();
  const store = createMockStore();
  const files = [];

  const runtime = createHostRuntime({
    rootDir: '/opt/last-host',
    store,
    shell,
    fsOps: {
      async mkdir() {},
      async access() {},
      async readlink() { throw new Error('missing'); },
      async symlink() {},
      async rename() {},
      async writeFile(file, content) { files.push({ file, content }); },
    },
  });

  await runtime.initHost({ hostId: 'edge-a', hostname: 'edge-a' });
  await runtime.prepareRelease({
    hostId: 'edge-a',
    org: 'acme',
    app: 'shop',
    releaseId: 'r1',
    artifactPath: '/artifact.tar.gz',
    entryCommand: 'node app/server.js',
    port: 3100,
  });

  const result = await runtime.activateRelease({
    hostId: 'edge-a',
    org: 'acme',
    app: 'shop',
    releaseId: 'r1',
  });

  assert.equal(result.status, 'ok');
  assert.equal(shell.calls.some((c) => c.command === 'tar'), true);
  assert.equal(shell.calls.some((c) => c.args?.includes('systemctl')), true);
  assert.equal(shell.calls.some((c) => c.args?.includes('caddy')), true);
  assert.equal(files.some((f) => f.file.endsWith('/caddy/Caddyfile')), true);
  const unitCall = shell.calls.find((c) => c.command === 'sudo' && c.args?.[0] === 'tee');
  assert.match(unitCall.options.stdin, /WorkingDirectory=\/opt\/last-host\/apps\/acme--shop\/current/);
  assert.match(unitCall.options.stdin, /ExecStart=node app\/server.js/);
  const caddyfile = files.find((f) => f.file.endsWith('/caddy/Caddyfile'));
  assert.match(caddyfile.content, /shop\.acme\.edge-a/);
});

test('activate release supports path routing on the base host', async () => {
  const shell = createMockShell();
  const store = createMockStore();
  const files = [];

  const runtime = createHostRuntime({
    rootDir: '/opt/last-host',
    store,
    shell,
    fsOps: {
      async mkdir() {},
      async access() {},
      async readlink() { throw new Error('missing'); },
      async symlink() {},
      async rename() {},
      async writeFile(file, content) { files.push({ file, content }); },
    },
  });

  await runtime.initHost({ hostId: 'lastjs.org', hostname: 'LastJS.org' });
  await runtime.prepareRelease({
    hostId: 'lastjs.org',
    org: 'demo',
    app: 'ecommerce',
    releaseId: 'r1',
    artifactPath: '/artifact.tar.gz',
    entryCommand: 'node app/server.js',
    port: 3200,
    routeMode: 'path',
  });

  const result = await runtime.activateRelease({
    hostId: 'lastjs.org',
    org: 'demo',
    app: 'ecommerce',
    releaseId: 'r1',
    routeMode: 'path',
  });

  assert.equal(result.defaultUrl, 'https://lastjs.org/demo/ecommerce');
  assert.equal(result.pathUrl, 'https://lastjs.org/demo/ecommerce');
  assert.equal(result.subdomainUrl, '');
  const caddyfile = files.find((f) => f.file.endsWith('/caddy/Caddyfile'));
  assert.match(caddyfile.content, /lastjs\.org \{\n  handle_path \/demo\/ecommerce\*/);
});

test('activate release renders custom domain route', async () => {
  const shell = createMockShell();
  const store = createMockStore();
  const files = [];

  const runtime = createHostRuntime({
    rootDir: '/opt/last-host',
    store,
    shell,
    fsOps: {
      async mkdir() {},
      async access() {},
      async readlink() { throw new Error('missing'); },
      async symlink() {},
      async rename() {},
      async writeFile(file, content) { files.push({ file, content }); },
    },
  });

  await runtime.initHost({ hostId: 'edge-a', hostname: 'Edge-A' });
  await runtime.prepareRelease({
    hostId: 'edge-a',
    org: 'acme',
    app: 'shop',
    releaseId: 'r1',
    artifactPath: '/artifact.tar.gz',
    entryCommand: 'node app/server.js',
    port: 3100,
    customDomain: 'Shop.Acme.com',
  });
  await runtime.activateRelease({ hostId: 'edge-a', org: 'acme', app: 'shop', releaseId: 'r1', customDomain: 'Shop.Acme.com' });
  const caddyfile = files.find((f) => f.file.endsWith('/caddy/Caddyfile'));
  assert.match(caddyfile.content, /shop\.acme\.com/);
});

test('rollback activates previous release when current exists', async () => {
  const shell = createMockShell();
  const store = createMockStore();

  const runtime = createHostRuntime({
    rootDir: '/opt/last-host',
    store,
    shell,
    fsOps: {
      async mkdir() {},
      async access() {},
      async readlink() { throw new Error('missing'); },
      async symlink() {},
      async rename() {},
      async writeFile() {},
    },
  });

  await runtime.prepareRelease({
    hostId: 'edge-a', org: 'acme', app: 'shop', releaseId: 'r1', artifactPath: '/artifact1.tar.gz', entryCommand: 'node app/server.js', port: 3100,
  });
  await runtime.prepareRelease({
    hostId: 'edge-a', org: 'acme', app: 'shop', releaseId: 'r2', artifactPath: '/artifact2.tar.gz', entryCommand: 'node app/server.js', port: 3100,
  });
  await runtime.activateRelease({ hostId: 'edge-a', org: 'acme', app: 'shop', releaseId: 'r2' });

  const result = await runtime.rollbackRelease({ hostId: 'edge-a', org: 'acme', app: 'shop' });
  assert.equal(result.activeReleaseId, 'r1');
});
