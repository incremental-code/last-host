import path from 'node:path';
import {
  defaultRoutePath,
  defaultRouteHost,
  normalizeBasePath,
  normalizeHostName,
  normalizeOrgName,
  normalizeRouteMode,
  validateRouteMode,
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
  const appPort = Number(flags.port || env.LAST_HOST_APP_PORT || 3000);
  const healthPath = flags['health-path'] || env.LAST_HOST_HEALTH_PATH || '/health';
  const customDomain = (flags['custom-domain'] || '').trim().toLowerCase();
  const rawRouteMode = flags['route-mode'] || env.LAST_HOST_ROUTE_MODE || 'subdomain';
  const routeValidation = validateRouteMode(rawRouteMode);
  if (!routeValidation.ok) throw new Error(routeValidation.error);
  const routeMode = normalizeRouteMode(rawRouteMode);

  const built = await buildArtifact({
    cwd,
    app: flags.app,
    output: flags.output,
    shell,
    fs,
  });

  const remoteDir = path.posix.join(remoteRoot, 'deploy', 'incoming', org, built.app);
  const remoteArtifact = path.posix.join(remoteDir, `${built.releaseId}.tar.gz`);
  const basePath = routeMode === 'subdomain'
    ? ''
    : normalizeBasePath(flags['base-path'] || env.LAST_HOST_BASE_PATH || '', { org, app: built.app });

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
    '--port',
    String(appPort),
    '--health-path',
    healthPath,
    '--route-mode',
    routeMode,
  ];
  if (basePath) {
    prepareCommand.push('--base-path', basePath);
  }
  if (customDomain) {
    prepareCommand.push('--custom-domain', customDomain);
  }

  const prepareResult = parseKeyValue(
    (await shell.run('ssh', [...sshArgs, commandString(prepareCommand)], { cwd })).stdout,
  );

  if (prepareResult.status === 'error') {
    throw new Error(prepareResult.message || 'prepare-release failed');
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
    '--route-mode',
    routeMode,
  ];
  if (basePath) {
    activateCommand.push('--base-path', basePath);
  }
  if (customDomain) {
    activateCommand.push('--custom-domain', customDomain);
  }

  const activateResult = parseKeyValue(
    (await shell.run('ssh', [...sshArgs, commandString(activateCommand)], { cwd })).stdout,
  );

  if (activateResult.status === 'error') {
    throw new Error(activateResult.message || 'activate-release failed');
  }

  const subdomainUrl = activateResult.subdomainUrl || (
    routeMode === 'subdomain' || routeMode === 'both'
      ? `https://${defaultRouteHost({ host, org, app: built.app })}`
      : ''
  );
  const pathUrl = activateResult.pathUrl || (
    routeMode === 'path' || routeMode === 'both'
      ? `https://${host}${basePath || defaultRoutePath({ org, app: built.app })}`
      : ''
  );
  const defaultUrl = activateResult.defaultUrl || (routeMode === 'path' ? pathUrl : subdomainUrl);
  const customUrl = activateResult.customUrl || (customDomain ? `https://${customDomain}` : '');

  return {
    ...built,
    defaultUrl,
    subdomainUrl,
    pathUrl,
    customUrl,
  };
}
