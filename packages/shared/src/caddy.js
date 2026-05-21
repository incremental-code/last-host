import { normalizeAppName, normalizeHostName, normalizeOrgName } from './naming.js';

function sanitizeDomain(domain) {
  if (typeof domain !== 'string') return '';
  return domain.trim().toLowerCase();
}

export function defaultRouteHost({ host, org, app }) {
  const normalizedHost = normalizeHostName(host);
  const normalizedOrg = normalizeOrgName(org);
  const normalizedApp = normalizeAppName(app);
  return `${normalizedApp}.${normalizedOrg}.${normalizedHost}`;
}

export function renderReverseProxyBlock({ domain, upstream }) {
  const cleanDomain = sanitizeDomain(domain);
  if (!cleanDomain) {
    throw new Error('domain is required');
  }
  if (!upstream || typeof upstream !== 'string') {
    throw new Error('upstream is required');
  }
  return `${cleanDomain} {\n  reverse_proxy ${upstream}\n}`;
}

export function renderDefaultRoute({ host, org, app, upstream }) {
  const domain = defaultRouteHost({ host, org, app });
  return renderReverseProxyBlock({ domain, upstream });
}

export function renderCustomDomainRoute({ domain, upstream }) {
  return renderReverseProxyBlock({ domain, upstream });
}

export function renderCaddyConfig({
  host,
  org,
  app,
  upstream,
  customDomains = [],
}) {
  const blocks = [renderDefaultRoute({ host, org, app, upstream })];
  for (const domain of customDomains) {
    blocks.push(renderCustomDomainRoute({ domain, upstream }));
  }
  return `${blocks.join('\n\n')}\n`;
}
