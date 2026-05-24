import { createShellRunner } from './shell.js';
import { createSqliteStore } from './sqlite-store.js';
import { createHostRuntime, hostPaths } from './runtime.js';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = 'true';
      continue;
    }
    flags[key] = next;
    i++;
  }
  return { command, flags };
}

function printResult(result = {}) {
  Object.entries(result).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    process.stdout.write(`${key}=${value}\n`);
  });
}

export async function runCli(argv, { shell = createShellRunner() } = {}) {
  const { command, flags } = parseArgs(argv);
  const rootDir = flags['root-dir'] || '/opt/last-host';
  const paths = hostPaths(rootDir);
  const store = createSqliteStore({ dbPath: flags['db-path'] || paths.dbPath, shell });
  const runtime = createHostRuntime({ rootDir, store, shell });

  if (command === 'init') {
    const result = await runtime.initHost({
      hostId: flags['host-id'] || flags.hostname,
      hostname: flags.hostname || flags['host-id'],
    });
    printResult({ status: 'ok', ...result });
    return result;
  }

  if (command === 'prepare-release' || command === 'receive-release') {
    const result = await runtime.prepareRelease({
      hostId: flags['host-id'],
      org: flags.org,
      app: flags.app,
      releaseId: flags['release-id'],
      artifactPath: flags.artifact,
      entryCommand: flags['entry-command'] || 'node app/server.js',
      port: flags.port ? Number(flags.port) : 0,
      healthPath: flags['health-path'] || '/health',
      url: flags.url || '',
      customDomain: flags['custom-domain'],
      routeMode: flags['route-mode'] || '',
      basePath: flags['base-path'] || '',
    });
    printResult({ status: 'ok', ...result });
    return result;
  }

  if (command === 'activate-release' || command === 'finalize-release') {
    const result = await runtime.activateRelease({
      hostId: flags['host-id'],
      org: flags.org,
      app: flags.app,
      releaseId: flags['release-id'],
      url: flags.url || '',
      customDomain: flags['custom-domain'],
      routeMode: flags['route-mode'] || '',
      basePath: flags['base-path'] || '',
    });
    printResult(result);
    return result;
  }

  if (command === 'rollback') {
    const result = await runtime.rollbackRelease({
      hostId: flags['host-id'],
      org: flags.org,
      app: flags.app,
      toReleaseId: flags['to-release-id'] || '',
    });
    printResult(result);
    return result;
  }

  if (command === 'set-env') {
    const vars = {};
    for (const [key, value] of Object.entries(flags)) {
      if (key === 'org' || key === 'app' || key === 'root-dir' || key === 'db-path') continue;
      vars[key.toUpperCase().replaceAll('-', '_')] = value;
    }
    const result = await runtime.setEnv({ org: flags.org, app: flags.app, vars });
    printResult({ status: 'ok', ...result });
    return result;
  }

  if (command === 'unset-env') {
    const keys = (flags.keys || '').split(',').map((k) => k.trim()).filter(Boolean);
    const result = await runtime.unsetEnv({ org: flags.org, app: flags.app, keys });
    printResult({ status: 'ok', ...result });
    return result;
  }

  if (command === 'get-env') {
    const vars = await runtime.getEnv({ org: flags.org, app: flags.app });
    printResult(vars);
    return vars;
  }

  throw new Error(`unknown command: ${command || '(empty)'}`);
}
