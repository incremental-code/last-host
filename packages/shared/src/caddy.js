import { normalizeAppName, normalizeHostName, normalizeOrgName } from './naming.js';

function sanitizeDomain(domain) {
  if (typeof domain !== 'string') return '';
  return domain.trim().toLowerCase();
}

function sanitizePathSegment(segment) {
  if (typeof segment !== 'string') return '';
  return segment
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function normalizeBasePath(basePath, { org = '', app = '' } = {}) {
  const fallback = org || app ? defaultRoutePath({ org, app }) : '';
  if (typeof basePath !== 'string' || !basePath.trim()) {
    return fallback;
  }

  const segments = basePath
    .trim()
    .split('/')
    .map(sanitizePathSegment)
    .filter(Boolean);

  return segments.length > 0 ? `/${segments.join('/')}` : fallback;
}

export function normalizeRouteMode(routeMode) {
  const normalized = typeof routeMode === 'string' ? routeMode.trim().toLowerCase() : '';
  return ['subdomain', 'path', 'custom', 'both'].includes(normalized) ? normalized : 'subdomain';
}

export function validateRouteMode(routeMode) {
  const normalized = typeof routeMode === 'string' ? routeMode.trim().toLowerCase() : '';
  return ['subdomain', 'path', 'custom', 'both'].includes(normalized)
    ? { ok: true }
    : { ok: false, error: 'route mode must be one of: subdomain, path, custom, both' };
}

export function defaultRouteHost({ host, org, app }) {
  const normalizedHost = normalizeHostName(host);
  const normalizedOrg = normalizeOrgName(org);
  const normalizedApp = normalizeAppName(app);
  return `${normalizedApp}.${normalizedOrg}.${normalizedHost}`;
}

export function defaultRoutePath({ org, app }) {
  return `/${normalizeOrgName(org)}/${normalizeAppName(app)}`;
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

export function renderPathHandle({ pathPrefix, upstream }) {
  const cleanPathPrefix = normalizeBasePath(pathPrefix);
  if (!cleanPathPrefix) {
    throw new Error('pathPrefix is required');
  }
  if (!upstream || typeof upstream !== 'string') {
    throw new Error('upstream is required');
  }
  return `handle_path ${cleanPathPrefix}* {\n    reverse_proxy ${upstream}\n  }`;
}

export function renderPathRoutes({ domain, routes = [] }) {
  const cleanDomain = sanitizeDomain(domain);
  if (!cleanDomain) {
    throw new Error('domain is required');
  }

  const handles = routes
    .map((route) => ({
      pathPrefix: normalizeBasePath(route.pathPrefix, route),
      upstream: route.upstream,
    }))
    .sort((left, right) => right.pathPrefix.length - left.pathPrefix.length)
    .map(({ pathPrefix, upstream }) => renderPathHandle({ pathPrefix, upstream }));

  if (handles.length === 0) {
    throw new Error('at least one path route is required');
  }

  return `${cleanDomain} {\n  ${handles.join('\n\n  ')}\n}`;
}

export function renderCustomDomainRoute({ domain, upstream }) {
  return renderReverseProxyBlock({ domain, upstream });
}

export function publicUrlForRoute({
  host,
  org,
  app,
  routeMode = 'subdomain',
  basePath = '',
  customDomain = '',
}) {
  const normalizedRouteMode = normalizeRouteMode(routeMode);
  if (normalizedRouteMode === 'path') {
    return `https://${normalizeHostName(host)}${normalizeBasePath(basePath, { org, app })}`;
  }
  if (normalizedRouteMode === 'custom') {
    const cleanDomain = sanitizeDomain(customDomain);
    if (!cleanDomain) throw new Error('custom domain is required for custom route');
    return `https://${cleanDomain}`;
  }
  return `https://${defaultRouteHost({ host, org, app })}`;
}

export function resolveRouteFromUrl({ url = '', host, org, app }) {
  const normalizedHost = normalizeHostName(host);
  const normalizedOrg = normalizeOrgName(org);
  const normalizedApp = normalizeAppName(app);
  const defaultHost = defaultRouteHost({ host: normalizedHost, org: normalizedOrg, app: normalizedApp });
  const raw = typeof url === 'string' && url.trim() ? url.trim() : `https://${defaultHost}`;
  const candidate = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('--url must be a valid absolute URL or hostname');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('--url must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('--url cannot include credentials');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('--url cannot include a query string or hash');
  }
  if (parsed.port && !['80', '443'].includes(parsed.port)) {
    throw new Error('--url cannot include a custom port');
  }

  const routeHost = normalizeHostName(parsed.hostname);
  const isRootPath = parsed.pathname === '' || parsed.pathname === '/';

  if (routeHost === defaultHost) {
    if (!isRootPath) {
      throw new Error('default subdomain URLs cannot include a path');
    }
    return {
      routeMode: 'subdomain',
      basePath: '',
      customDomain: '',
      url: `https://${defaultHost}`,
    };
  }

  if (routeHost === normalizedHost) {
    if (isRootPath) {
      throw new Error('base host root is not a deployable app URL; use a path URL, default subdomain URL, or custom domain');
    }
    const basePath = normalizeBasePath(parsed.pathname, { org: normalizedOrg, app: normalizedApp });
    return {
      routeMode: 'path',
      basePath,
      customDomain: '',
      url: `https://${normalizedHost}${basePath}`,
    };
  }

  if (!isRootPath) {
    throw new Error('custom domain URLs cannot include a path');
  }

  return {
    routeMode: 'custom',
    basePath: '',
    customDomain: routeHost,
    url: `https://${routeHost}`,
  };
}

export function renderCaddyConfig({ host, apps = [] }) {
  const blocks = [];
  const pathRoutes = [];

  for (const app of apps) {
    const routeMode = normalizeRouteMode(app.routeMode);
    const customDomains = Array.isArray(app.customDomains)
      ? app.customDomains
      : (app.customDomain ? [app.customDomain] : []);

    if (routeMode === 'subdomain' || routeMode === 'both') {
      blocks.push(
        renderDefaultRoute({
          host,
          org: app.org,
          app: app.app,
          upstream: app.upstream,
        }),
      );
    }

    if (routeMode === 'custom') {
      const [customDomain] = customDomains;
      if (!customDomain) {
        throw new Error('custom domain is required for custom route');
      }
      blocks.push(renderCustomDomainRoute({ domain: customDomain, upstream: app.upstream }));
      continue;
    }

    if (routeMode === 'path' || routeMode === 'both') {
      pathRoutes.push({
        org: app.org,
        app: app.app,
        pathPrefix: app.basePath,
        upstream: app.upstream,
      });
    }

    for (const domain of customDomains) {
      blocks.push(renderCustomDomainRoute({ domain, upstream: app.upstream }));
    }
  }

  if (pathRoutes.length > 0) {
    blocks.push(renderPathRoutes({ domain: host, routes: pathRoutes }));
  }
  return `${blocks.join('\n\n')}\n`;
}
