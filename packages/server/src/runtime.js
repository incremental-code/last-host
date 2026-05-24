import path from 'node:path';
import { access, mkdir, readlink, rename, symlink, writeFile } from 'node:fs/promises';
import {
  appCanonicalId,
  defaultRouteHost,
  normalizeAppName,
  normalizeOrgName,
  normalizeHostName,
  normalizeRouteMode,
  publicUrlForRoute,
  releaseLayout,
  releasePaths,
  renderCaddyConfig,
  resolveRouteFromUrl,
} from '@incremental-code/last-host-shared';

export function hostPaths(rootDir = '/opt/last-host') {
  return {
    rootDir,
    appsDir: path.join(rootDir, 'apps'),
    caddyDir: path.join(rootDir, 'caddy'),
    caddyfilePath: path.join(rootDir, 'caddy', 'Caddyfile'),
    deployIncomingDir: path.join(rootDir, 'deploy', 'incoming'),
    stateDir: path.join(rootDir, 'state'),
    dbPath: path.join(rootDir, 'state', 'runtime.sqlite'),
  };
}

export function createHostRuntime({ rootDir = '/opt/last-host', store, shell, fsOps = {} }) {
  if (!store) throw new Error('store is required');
  if (!shell?.run) throw new Error('shell is required');

  const paths = hostPaths(rootDir);
  const ops = {
    access,
    mkdir,
    readlink,
    rename,
    symlink,
    writeFile,
    ...fsOps,
  };

  function appRoot(org, app) {
    const appId = appCanonicalId(org, app);
    return path.join(paths.appsDir, appId);
  }

  async function ensureBaseDirs() {
    await Promise.all([
      ops.mkdir(paths.rootDir, { recursive: true }),
      ops.mkdir(paths.appsDir, { recursive: true }),
      ops.mkdir(paths.caddyDir, { recursive: true }),
      ops.mkdir(paths.deployIncomingDir, { recursive: true }),
      ops.mkdir(paths.stateDir, { recursive: true }),
    ]);
  }

  async function ensureAppDirs(org, app) {
    const normalizedOrg = normalizeOrgName(org);
    const normalizedApp = normalizeAppName(app);
    const root = appRoot(normalizedOrg, normalizedApp);
    const layout = releaseLayout(root);
    await Promise.all([
      ops.mkdir(root, { recursive: true }),
      ops.mkdir(layout.releasesDir, { recursive: true }),
      ops.mkdir(layout.sharedDir, { recursive: true }),
      ops.mkdir(path.join(layout.sharedDir, 'data'), { recursive: true }),
      ops.mkdir(path.join(layout.sharedDir, 'config'), { recursive: true }),
      ops.mkdir(path.join(root, 'logs'), { recursive: true }),
    ]);
    return { root, layout, normalizedOrg, normalizedApp };
  }

  async function switchCurrentSymlink({ appDir, releaseId }) {
    const layout = releaseLayout(appDir);
    const target = path.join(layout.releasesDir, releaseId);
    await ops.access(target);

    try {
      const current = await ops.readlink(layout.currentLink);
      const resolvedCurrent = path.resolve(appDir, current);
      if (resolvedCurrent === target) return { changed: false };
    } catch {
      // missing current symlink is expected for first release
    }

    const tempLink = `${layout.currentLink}.next`;
    await ops.symlink(target, tempLink);
    await ops.rename(tempLink, layout.currentLink);
    return { changed: true };
  }

  async function writeSystemdUnit({ serviceName, appDir, entryCommand, port, envFilePath }) {
    const unitPath = `/etc/systemd/system/${serviceName}.service`;
    const unit = `[Unit]
Description=last-host app ${serviceName}
After=network.target

[Service]
Type=simple
WorkingDirectory=${path.join(appDir, 'current')}
ExecStart=${entryCommand}
Environment=PORT=${port}
EnvironmentFile=-${envFilePath}
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
`;
    await shell.run('sudo', ['mkdir', '-p', '/etc/systemd/system']);
    await shell.run('sudo', ['tee', unitPath], { stdin: unit });
    await shell.run('sudo', ['systemctl', 'daemon-reload']);
    await shell.run('sudo', ['systemctl', 'enable', '--now', `${serviceName}.service`]);
    await shell.run('sudo', ['systemctl', 'restart', `${serviceName}.service`]);
  }

  async function renderAndReloadCaddy({ hostId }) {
    const host = await store.getHostById(hostId);
    if (!host) throw new Error(`host not found: ${hostId}`);

    const apps = await store.listCaddyApps(hostId);
    const content = renderCaddyConfig({
      host: host.hostname,
      apps: apps.map((item) => ({
        org: item.org,
        app: item.app,
        upstream: `127.0.0.1:${item.port}`,
        routeMode: item.route_mode,
        basePath: item.base_path,
        customDomains: item.custom_domain ? [item.custom_domain] : [],
      })),
    });
    await ops.writeFile(paths.caddyfilePath, content, 'utf8');
    await shell.run('sudo', ['caddy', 'reload', '--config', paths.caddyfilePath]);
  }

  function resolveRoute({ url = '', host, org, app, routeMode = 'subdomain', basePath = '', customDomain = '' }) {
    if (url) {
      return resolveRouteFromUrl({ url, host, org, app });
    }

    const normalizedRouteMode = normalizeRouteMode(routeMode);
    const normalizedCustomDomain = customDomain ? customDomain.trim().toLowerCase() : '';
    return {
      routeMode: normalizedRouteMode,
      basePath: normalizedRouteMode === 'path' ? basePath : '',
      customDomain: normalizedRouteMode === 'custom' ? normalizedCustomDomain : normalizedCustomDomain,
      url: publicUrlForRoute({
        host,
        org,
        app,
        routeMode: normalizedRouteMode,
        basePath,
        customDomain: normalizedCustomDomain,
      }),
    };
  }

  return {
    paths,

    async initHost({ hostId, hostname }) {
      await ensureBaseDirs();
      await store.init();
      const host = await store.upsertHost({ id: hostId, hostname });
      return { ...host, rootDir: paths.rootDir, dbPath: paths.dbPath };
    },

    async prepareRelease({
      hostId,
      org,
      app,
      releaseId,
      artifactPath,
      entryCommand,
      port,
      healthPath = '/health',
      url = '',
      customDomain,
      routeMode = 'subdomain',
      basePath = '',
    }) {
      await ensureBaseDirs();
      const { root, normalizedOrg, normalizedApp } = await ensureAppDirs(org, app);
      const host = (await store.getHostById(hostId)) || { hostname: hostId };
      const release = releasePaths(root, releaseId);
      const resolvedRoute = resolveRoute({
        url,
        host: host.hostname,
        org: normalizedOrg,
        app: normalizedApp,
        routeMode,
        basePath,
        customDomain,
      });
      await ops.mkdir(release.releaseDir, { recursive: true });
      await shell.run('tar', ['-xzf', artifactPath, '-C', release.releaseDir]);
      await shell.run('npm', ['install', '--omit=dev'], { cwd: release.releaseDir });

      const appRecord = await store.upsertApp({ org: normalizedOrg, app: normalizedApp, hostId });
      const allocatedPort = port || await store.allocatePort(appRecord.id);
      await ops.writeFile(
        path.join(release.releaseDir, 'metadata.json'),
        JSON.stringify({
          org: normalizedOrg,
          app: normalizedApp,
          releaseId: release.releaseId,
          entryCommand,
          port: allocatedPort,
          healthPath,
          routeMode: resolvedRoute.routeMode,
          basePath: resolvedRoute.basePath,
          url: resolvedRoute.url,
        }, null, 2),
        'utf8',
      );

      const serviceName = `last-host-${normalizedOrg}-${normalizedApp}`;
      await store.upsertRuntime({ appId: appRecord.id, entryCommand, port: allocatedPort, healthPath, serviceName });
      await store.upsertRouting({
        appId: appRecord.id,
        routeMode: resolvedRoute.routeMode,
        basePath: resolvedRoute.basePath,
        org: normalizedOrg,
        app: normalizedApp,
      });
      await store.upsertRelease({ releaseId: release.releaseId, appId: appRecord.id, artifactRef: artifactPath, status: 'prepared' });
      await store.setDomains({
        appId: appRecord.id,
        defaultDomain: defaultRouteHost({ host: host.hostname, org: normalizedOrg, app: normalizedApp }),
        customDomain: resolvedRoute.customDomain || '',
      });

      return { appId: appRecord.id, releaseId: release.releaseId, serviceName, port: allocatedPort };
    },

    async activateRelease({ hostId, org, app, releaseId, url = '', customDomain, routeMode = '', basePath = '' }) {
      const normalizedOrg = normalizeOrgName(org);
      const normalizedApp = normalizeAppName(app);
      const appRecord = await store.getApp(normalizedOrg, normalizedApp);
      if (!appRecord) throw new Error(`app not found: ${normalizedOrg}/${normalizedApp}`);
      const host = (await store.getHostById(hostId)) || { hostname: hostId };
      const runtime = await store.getRuntime(appRecord.id);
      if (!runtime) throw new Error(`runtime not found for ${normalizedOrg}/${normalizedApp}`);
      const routing = await store.getRouting?.(appRecord.id);
      const effectiveCustomDomain = customDomain ?? (await store.getCustomDomain?.(appRecord.id)) ?? '';
      const resolvedRoute = resolveRoute({
        url,
        host: host.hostname,
        org: normalizedOrg,
        app: normalizedApp,
        routeMode: routeMode || routing?.route_mode || 'subdomain',
        basePath: basePath || routing?.base_path || '',
        customDomain: effectiveCustomDomain,
      });

      const appDir = appRoot(normalizedOrg, normalizedApp);
      const release = releasePaths(appDir, releaseId);
      await switchCurrentSymlink({ appDir, releaseId: release.releaseId });

      const envFilePath = path.join(appDir, 'shared', 'config', '.env');
      await writeSystemdUnit({ serviceName: runtime.service_name, appDir, entryCommand: runtime.entry_command, port: runtime.port, envFilePath });
      await store.setActiveRelease({ appId: appRecord.id, releaseId: release.releaseId });
      await store.upsertRouting({
        appId: appRecord.id,
        routeMode: resolvedRoute.routeMode,
        basePath: resolvedRoute.basePath,
        org: normalizedOrg,
        app: normalizedApp,
      });
      await store.setDomains({
        appId: appRecord.id,
        defaultDomain: defaultRouteHost({ host: host.hostname, org: normalizedOrg, app: normalizedApp }),
        customDomain: resolvedRoute.customDomain,
      });
      await renderAndReloadCaddy({ hostId });

      return {
        status: 'ok',
        activeReleaseId: release.releaseId,
        url: resolvedRoute.url,
      };
    },

    async rollbackRelease({ hostId, org, app, toReleaseId = '' }) {
      const normalizedOrg = normalizeOrgName(org);
      const normalizedApp = normalizeAppName(app);
      const appRecord = await store.getApp(normalizedOrg, normalizedApp);
      if (!appRecord) throw new Error(`app not found: ${normalizedOrg}/${normalizedApp}`);
      const runtime = await store.getRuntime(appRecord.id);
      if (!runtime) throw new Error(`runtime not found: ${normalizedOrg}/${normalizedApp}`);

      const releaseId = toReleaseId || (await store.findRollbackRelease(appRecord.id, runtime.active_release_id));
      if (!releaseId) throw new Error('no rollback target found');
      return this.activateRelease({ hostId, org: normalizedOrg, app: normalizedApp, releaseId });
    },

    async setEnv({ org, app, vars = {} }) {
      const normalizedOrg = normalizeOrgName(org);
      const normalizedApp = normalizeAppName(app);
      const appRecord = await store.getApp(normalizedOrg, normalizedApp);
      if (!appRecord) throw new Error(`app not found: ${normalizedOrg}/${normalizedApp}`);
      await store.setEnvVars({ appId: appRecord.id, vars });
      await this.writeEnvFile({ org: normalizedOrg, app: normalizedApp });
      return { appId: appRecord.id, count: Object.keys(vars).length };
    },

    async unsetEnv({ org, app, keys = [] }) {
      const normalizedOrg = normalizeOrgName(org);
      const normalizedApp = normalizeAppName(app);
      const appRecord = await store.getApp(normalizedOrg, normalizedApp);
      if (!appRecord) throw new Error(`app not found: ${normalizedOrg}/${normalizedApp}`);
      await store.deleteEnvVars({ appId: appRecord.id, keys });
      await this.writeEnvFile({ org: normalizedOrg, app: normalizedApp });
      return { appId: appRecord.id, removed: keys.length };
    },

    async getEnv({ org, app }) {
      const normalizedOrg = normalizeOrgName(org);
      const normalizedApp = normalizeAppName(app);
      const appRecord = await store.getApp(normalizedOrg, normalizedApp);
      if (!appRecord) throw new Error(`app not found: ${normalizedOrg}/${normalizedApp}`);
      const rows = await store.getEnvVars(appRecord.id);
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },

    async writeEnvFile({ org, app }) {
      const normalizedOrg = normalizeOrgName(org);
      const normalizedApp = normalizeAppName(app);
      const appRecord = await store.getApp(normalizedOrg, normalizedApp);
      if (!appRecord) return;
      const rows = await store.getEnvVars(appRecord.id);
      const appDir = appRoot(normalizedOrg, normalizedApp);
      const envFilePath = path.join(appDir, 'shared', 'config', '.env');
      const lines = rows.map((r) => {
        const needsQuoting = /[\n\r"' \t\\]/.test(r.value);
        const escaped = needsQuoting ? `"${r.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"` : r.value;
        return `${r.key}=${escaped}`;
      });
      const content = lines.join('\n') + (lines.length ? '\n' : '');
      await ops.mkdir(path.join(appDir, 'shared', 'config'), { recursive: true });
      await ops.writeFile(envFilePath, content, 'utf8');
    },
  };
}
