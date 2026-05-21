const SLUG_PART_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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
  return normalizeSlugPart(input);
}

export function validateOrgName(org) {
  return validateSlugPart(org, 'org');
}

export function validateHostName(host) {
  return validateSlugPart(host, 'host');
}

export function canonicalId(...parts) {
  const normalized = parts.map(normalizeSlugPart).filter(Boolean);
  if (normalized.length === 0) return '';
  return normalized.join('--');
}

export function appCanonicalId(org, app) {
  return canonicalId(org, app);
}
