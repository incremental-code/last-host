# @incremental-code/last-host-shared

Shared helpers for the `last-host` ecosystem.

## Includes

- app/org/host naming and normalization helpers
- release path helpers
- SQLite schema and migration helpers
- Caddy route rendering helpers

## Install

```bash
npm install @incremental-code/last-host-shared
```

## Usage

```js
import { appNameFromPackageName, releasePaths, latestSchemaVersion } from '@incremental-code/last-host-shared';

const app = appNameFromPackageName('@acme/storefront');
const release = releasePaths({
  rootDir: '/opt/last-host',
  org: 'acme',
  app,
  releaseId: 'r1',
});

console.log(app);
console.log(release.currentLink);
console.log(latestSchemaVersion());
```

## Exports

- `@incremental-code/last-host-shared`
- `@incremental-code/last-host-shared/naming`
- `@incremental-code/last-host-shared/release-paths`
- `@incremental-code/last-host-shared/sqlite`
- `@incremental-code/last-host-shared/caddy`
