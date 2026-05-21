export const V1_MIGRATION = {
  version: 1,
  name: 'v1-init',
  statements: [
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS hosts (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      org TEXT NOT NULL,
      app TEXT NOT NULL,
      host_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(org, app),
      FOREIGN KEY(host_id) REFERENCES hosts(id)
    )`,
    `CREATE TABLE IF NOT EXISTS releases (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      artifact_ref TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(app_id, revision),
      FOREIGN KEY(app_id) REFERENCES apps(id)
    )`,
    `CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      domain TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK(kind IN ('default', 'custom')),
      is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(app_id) REFERENCES apps(id)
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_default_per_app
      ON domains(app_id)
      WHERE is_default = 1`,
  ],
};

export const V2_MIGRATION = {
  version: 2,
  name: 'v2-runtime',
  statements: [
    `CREATE TABLE IF NOT EXISTS app_runtime (
      app_id TEXT PRIMARY KEY,
      entry_command TEXT NOT NULL,
      port INTEGER NOT NULL,
      health_path TEXT NOT NULL DEFAULT '/health',
      service_name TEXT NOT NULL,
      active_release_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(app_id) REFERENCES apps(id),
      FOREIGN KEY(active_release_id) REFERENCES releases(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_releases_app_revision
      ON releases(app_id, revision DESC)`,
  ],
};

export const MIGRATIONS = [V1_MIGRATION, V2_MIGRATION];

export function schemaStatementsForVersion(version = 1) {
  const migration = MIGRATIONS.find((item) => item.version === version);
  return migration ? [...migration.statements] : [];
}

export function latestSchemaVersion() {
  return MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
}

export async function migrate({ execute, fromVersion = 0 }) {
  if (typeof execute !== 'function') {
    throw new TypeError('execute must be a function');
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= fromVersion) continue;
    for (const statement of migration.statements) {
      await execute(statement);
    }
    await execute(
      `INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
       VALUES (${migration.version}, '${migration.name}', datetime('now'))`,
    );
  }

  return latestSchemaVersion();
}
