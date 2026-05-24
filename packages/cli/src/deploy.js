import path from 'node:path';
import {
  normalizeHostName,
  normalizeOrgName,
  publicUrlForRoute,
  resolveRouteFromUrl,
  validateHostName,
  validateOrgName,
} from '@incremental-code/last-host-shared';
import { buildArtifact } from './build.js';

function quoteShellArg(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function commandString(parts = []) {
  return parts.map(quoteShellArg).join(' ');
}

function parseKeyValue(stdout = '') {
  const result = {};
  for (const line of String(stdout).split('\n')) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    result[key] = value;
  }
  return result;
}

function sshCommonArgs({ sshUser, sshHost, sshPort, sshKey }) {
  const target = `${sshUser}@${sshHost}`;
  const args = ['-p', String(sshPort)];
  if (sshKey) args.push('-i', sshKey);
  args.push(target);
  return args;
}

function scpCommonArgs({ sshPort, sshKey }) {
  const args = ['-P', String(sshPort)];
  if (sshKey) args.push('-i', sshKey);
  return args;
}

function resolveLegacyRoute({ flags, env, host, org, app }) {
  const customDomain = (flags['custom-domain'] || '').trim().toLowerCase();
  const routeMode = typeof (flags['route-mode'] || env.LAST_HOST_ROUTE_MODE || 'subdomain') === 'string'
    ? (flags['route-mode'] || env.LAST_HOST_ROUTE_MODE || 'subdomain').trim().toLowerCase()
    : 'subdomain';
  const basePath = routeMode === 'path'
    ? (flags['base-path'] || env.LAST_HOST_BASE_PATH || '')
    : '';

  return {
    routeMode,
    basePath,
    customDomain,
    url: publicUrlForRoute({ host, org, app, routeMode, basePath, customDomain }),
  };
}

export async function deployApp({
  cwd,
  flags,
  env,
  shell,
  fs,
}) {
  const org = normalizeOrgName(flags.org || '');
  const host = normalizeHostName(flags.host || '');

  if (!org) throw new Error('--org is required');
  if (!host) throw new Error('--host is required');

  const orgValidation = validateOrgName(org);
  const hostValidation = validateHostName(host);
  if (!orgValidation.ok) throw new Error(orgValidation.error);
  if (!hostValidation.ok) throw new Error(hostValidation.error);

  const sshUser = flags['ssh-user'] || env.LAST_HOST_SSH_USER || 'deploy';
  const sshHost = flags['ssh-host'] || env.LAST_HOST_SSH_HOST || host;
  const sshPort = Number(flags['ssh-port'] || env.LAST_HOST_SSH_PORT || 22);
  const sshKey = flags['ssh-key'] || env.LAST_HOST_SSH_KEY || '';
  const remoteRoot = flags['remote-root'] || env.LAST_HOST_REMOTE_ROOT || '/opt/last-host';
  const remoteCli = flags['remote-cli'] || env.LAST_HOST_REMOTE_CLI || 'last-host-server';
  const entryCommand = flags['entry-command'] || env.LAST_HOST_ENTRY_COMMAND || 'npm start';
  const healthPath = flags['health-path'] || env.LAST_HOST_HEALTH_PATH || '/health';
  const envFile = flags['env-file'] || '';

  const built = await buildArtifact({
    cwd,
    app: flags.app,
    output: flags.output,
    shell,
    fs,
  });

  const remoteDir = path.posix.join(remoteRoot, 'deploy', 'incoming', org, built.app);
  const remoteArtifact = path.posix.join(remoteDir, `${built.releaseId}.tar.gz`);
  const publicHost = normalizeHostName(sshHost || host);
  const route = flags.url || env.LAST_HOST_URL
    ? resolveRouteFromUrl({ url: flags.url || env.LAST_HOST_URL || '', host: publicHost, org, app: built.app })
    : resolveLegacyRoute({ flags, env, host: publicHost, org, app: built.app });

  const sshArgs = sshCommonArgs({ sshUser, sshHost, sshPort, sshKey });
  const scpArgs = scpCommonArgs({ sshPort, sshKey });
  const sshTarget = `${sshUser}@${sshHost}`;

  await shell.run('ssh', [...sshArgs, commandString(['mkdir', '-p', remoteDir])], { cwd });
  await shell.run('scp', [...scpArgs, built.artifactPath, `${sshTarget}:${remoteArtifact}`], { cwd });

  const prepareCommand = [
    remoteCli,
    'prepare-release',
    '--host-id',
    host,
    '--org',
    org,
    '--app',
    built.app,
    '--release-id',
    built.releaseId,
    '--artifact',
    remoteArtifact,
    '--entry-command',
    entryCommand,
    '--health-path',
    healthPath,
    '--url',
    route.url,
  ];

  const prepareResult = parseKeyValue(
    (await shell.run('ssh', [...sshArgs, commandString(prepareCommand)], { cwd })).stdout,
  );

  if (prepareResult.status === 'error') {
    throw new Error(prepareResult.message || 'prepare-release failed');
  }

  if (envFile) {
    const remoteEnvDir = path.posix.join(remoteRoot, 'apps', `${org}--${built.app}`, 'shared', 'config');
    const remoteEnvPath = path.posix.join(remoteEnvDir, '.env');
    await shell.run('ssh', [...sshArgs, commandString(['mkdir', '-p', remoteEnvDir])], { cwd });
    await shell.run('scp', [...scpArgs, path.resolve(cwd, envFile), `${sshTarget}:${remoteEnvPath}`], { cwd });
  }

  const activateCommand = [
    remoteCli,
    'activate-release',
    '--host-id',
    host,
    '--org',
    org,
    '--app',
    built.app,
    '--release-id',
    built.releaseId,
    '--url',
    route.url,
  ];

  const activateResult = parseKeyValue(
    (await shell.run('ssh', [...sshArgs, commandString(activateCommand)], { cwd })).stdout,
  );

  if (activateResult.status === 'error') {
    throw new Error(activateResult.message || 'activate-release failed');
  }

  return {
    ...built,
    url: activateResult.url || route.url,
  };
}
