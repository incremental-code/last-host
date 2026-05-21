import {
  appCanonicalId,
  migrate,
  normalizeAppName,
  normalizeBasePath,
  normalizeHostName,
  normalizeOrgName,
  normalizeRouteMode,
} from '@incremental-code/last-host-shared';

function sqlString(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function sqlInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createSqliteStore({ dbPath, shell }) {
  if (!dbPath) throw new Error('dbPath is required');
  if (!shell?.run) throw new Error('shell runner is required');

  async function run(statement) {
    await shell.run('sqlite3', [dbPath, statement]);
  }

  async function queryRows(statement) {
    const { stdout } = await shell.run('sqlite3', ['-json', dbPath, statement]);
    const text = stdout.trim();
    return text ? JSON.parse(text) : [];
  }

  return {
    async init() {
      await migrate({ execute: run });
    },

    async upsertHost({ id, hostname }) {
      const hostName = normalizeHostName(hostname || id);
      const hostId = id || hostName;
      await run(`INSERT INTO hosts(id, hostname)
        VALUES (${sqlString(hostId)}, ${sqlString(hostName)})
        ON CONFLICT(id) DO UPDATE SET hostname=excluded.hostname`);
      return { id: hostId, hostname: hostName };
    },

    async upsertApp({ org, app, hostId }) {
      const normalizedOrg = normalizeOrgName(org);
      const normalizedApp = normalizeAppName(app);
      const appId = appCanonicalId(normalizedOrg, normalizedApp);
      await run(`INSERT INTO apps(id, org, app, host_id)
        VALUES (${sqlString(appId)}, ${sqlString(normalizedOrg)}, ${sqlString(normalizedApp)}, ${sqlString(hostId)})
        ON CONFLICT(org, app) DO UPDATE SET host_id=excluded.host_id, updated_at=datetime('now')`);
      return { id: appId, org: normalizedOrg, app: normalizedApp };
    },

    async upsertRuntime({ appId, entryCommand, port, healthPath, serviceName }) {
      await run(`INSERT INTO app_runtime(app_id, entry_command, port, health_path, service_name, updated_at)
        VALUES (${sqlString(appId)}, ${sqlString(entryCommand)}, ${sqlInt(port)}, ${sqlString(healthPath || '/health')}, ${sqlString(serviceName)}, datetime('now'))
        ON CONFLICT(app_id) DO UPDATE SET
          entry_command=excluded.entry_command,
          port=excluded.port,
          health_path=excluded.health_path,
          service_name=excluded.service_name,
          updated_at=datetime('now')`);
    },

    async upsertRouting({ appId, routeMode = 'subdomain', basePath = '', org = '', app = '' }) {
      const normalizedRouteMode = normalizeRouteMode(routeMode);
      const normalizedBasePath = normalizedRouteMode === 'subdomain'
        ? ''
        : normalizeBasePath(basePath, { org, app });
      await run(`INSERT INTO app_routes(app_id, route_mode, base_path, updated_at)
        VALUES (${sqlString(appId)}, ${sqlString(normalizedRouteMode)}, ${sqlString(normalizedBasePath)}, datetime('now'))
        ON CONFLICT(app_id) DO UPDATE SET
          route_mode=excluded.route_mode,
          base_path=excluded.base_path,
          updated_at=datetime('now')`);
    },

    async upsertRelease({ releaseId, appId, artifactRef, status = 'prepared' }) {
      const [{ nextRevision = 1 } = {}] = await queryRows(
        `SELECT COALESCE(MAX(revision), 0) + 1 AS nextRevision FROM releases WHERE app_id = ${sqlString(appId)}`,
      );
      await run(`INSERT INTO releases(id, app_id, revision, artifact_ref, status)
        VALUES (${sqlString(releaseId)}, ${sqlString(appId)}, ${sqlInt(nextRevision, 1)}, ${sqlString(artifactRef || '')}, ${sqlString(status)})
        ON CONFLICT(id) DO UPDATE SET
          artifact_ref=excluded.artifact_ref,
          status=excluded.status`);
    },

    async setActiveRelease({ appId, releaseId }) {
      await run(`UPDATE releases SET status='inactive' WHERE app_id=${sqlString(appId)} AND id != ${sqlString(releaseId)}`);
      await run(`UPDATE releases SET status='active' WHERE app_id=${sqlString(appId)} AND id = ${sqlString(releaseId)}`);
      await run(`UPDATE app_runtime SET active_release_id=${sqlString(releaseId)}, updated_at=datetime('now') WHERE app_id=${sqlString(appId)}`);
    },

    async setDomains({ appId, defaultDomain, customDomain }) {
      await run(`DELETE FROM domains WHERE app_id=${sqlString(appId)} AND kind='default'`);
      await run(`INSERT INTO domains(id, app_id, domain, kind, is_default)
        VALUES (${sqlString(`${appId}--default`)}, ${sqlString(appId)}, ${sqlString(defaultDomain)}, 'default', 1)
        ON CONFLICT(domain) DO UPDATE SET app_id=excluded.app_id, kind='default', is_default=1`);

      await run(`DELETE FROM domains WHERE app_id=${sqlString(appId)} AND kind='custom'`);
      const normalizedCustomDomain = customDomain ? customDomain.trim().toLowerCase() : '';
      if (normalizedCustomDomain) {
        await run(`INSERT INTO domains(id, app_id, domain, kind, is_default)
          VALUES (${sqlString(`${appId}--custom`)}, ${sqlString(appId)}, ${sqlString(normalizedCustomDomain)}, 'custom', 0)
          ON CONFLICT(domain) DO UPDATE SET app_id=excluded.app_id, kind='custom', is_default=0`);
      }
    },

    async getHostById(hostId) {
      const rows = await queryRows(`SELECT id, hostname FROM hosts WHERE id=${sqlString(hostId)} LIMIT 1`);
      return rows[0] || null;
    },

    async getApp(org, app) {
      const rows = await queryRows(`SELECT id, org, app, host_id FROM apps
        WHERE org=${sqlString(normalizeOrgName(org))} AND app=${sqlString(normalizeAppName(app))} LIMIT 1`);
      return rows[0] || null;
    },

    async getRuntime(appId) {
      const rows = await queryRows(`SELECT app_id, entry_command, port, health_path, service_name, active_release_id
        FROM app_runtime WHERE app_id=${sqlString(appId)} LIMIT 1`);
      return rows[0] || null;
    },

    async getRouting(appId) {
      const rows = await queryRows(`SELECT app_id, route_mode, base_path
        FROM app_routes WHERE app_id=${sqlString(appId)} LIMIT 1`);
      return rows[0] || null;
    },

    async getCustomDomain(appId) {
      const rows = await queryRows(`SELECT domain
        FROM domains WHERE app_id=${sqlString(appId)} AND kind='custom' LIMIT 1`);
      return rows[0]?.domain || '';
    },

    async findRollbackRelease(appId, currentReleaseId) {
      const rows = await queryRows(`SELECT id FROM releases
        WHERE app_id=${sqlString(appId)} AND id != ${sqlString(currentReleaseId)}
        ORDER BY revision DESC LIMIT 1`);
      return rows[0]?.id || null;
    },

    async listCaddyApps(hostId) {
      return queryRows(`SELECT a.org, a.app, r.port,
        COALESCE(ar.route_mode, 'subdomain') AS route_mode,
        COALESCE(ar.base_path, '') AS base_path,
        COALESCE(MAX(CASE WHEN d.kind='custom' THEN d.domain END), '') AS custom_domain
        FROM apps a
        JOIN app_runtime r ON r.app_id = a.id
        LEFT JOIN app_routes ar ON ar.app_id = a.id
        LEFT JOIN domains d ON d.app_id = a.id
        WHERE a.host_id = ${sqlString(hostId)}
        GROUP BY a.id, a.org, a.app, r.port, ar.route_mode, ar.base_path
        ORDER BY a.org, a.app`);
    },
  };
}
