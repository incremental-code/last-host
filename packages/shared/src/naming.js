const SLUG_PART_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const HOST_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const HOSTNAME_MAX_LENGTH = 253;

function normalizeSlugPart(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function validateSlugPart(value, label) {
  if (!SLUG_PART_REGEX.test(value)) {
    return { ok: false, error: `${label} must match ${SLUG_PART_REGEX.source}` };
  }
  return { ok: true };
}

export function normalizeAppName(input) {
  if (typeof input !== 'string') return '';
  const noScope = input.trim().replace(/^@[^/]+\//, '');
  return normalizeSlugPart(noScope);
}

export function appNameFromPackageName(packageName) {
  return normalizeAppName(packageName);
}

export function appNameFromPackageJson(packageJson) {
  if (!packageJson || typeof packageJson !== 'object') return '';
  return appNameFromPackageName(packageJson.name);
}

export function normalizeOrgName(input) {
  return normalizeSlugPart(input);
}

export function normalizeHostName(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .toLowerCase()
    .split('.')
    .map(normalizeSlugPart)
    .filter(Boolean)
    .join('.');
}

export function validateOrgName(org) {
  return validateSlugPart(org, 'org');
}

export function validateHostName(host) {
  if (typeof host !== 'string') {
    return { ok: false, error: `host must match ${HOST_LABEL_REGEX.source}` };
  }
  const trimmed = host.trim().toLowerCase();
  if (!trimmed || trimmed.length > HOSTNAME_MAX_LENGTH) {
    return { ok: false, error: `host must be 1-${HOSTNAME_MAX_LENGTH} characters` };
  }
  const labels = trimmed.split('.');
  if (labels.some((label) => !HOST_LABEL_REGEX.test(label))) {
    return { ok: false, error: `host labels must match ${HOST_LABEL_REGEX.source}` };
  }
  return { ok: true };
}

export function canonicalId(...parts) {
  const normalized = parts.map(normalizeSlugPart).filter(Boolean);
  if (normalized.length === 0) return '';
  return normalized.join('--');
}

export function appCanonicalId(org, app) {
  return canonicalId(org, app);
}
