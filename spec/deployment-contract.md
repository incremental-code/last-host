# Deployment contract (v1)

Concise CLI ↔ host handshake for tarball deploys.

## Upload artifact

CLI uploads `<release-id>.tar.gz` via SCP to:

```text
/opt/last-host/deploy/incoming/<org>/<app>/<release-id>.tar.gz
```

## Required deploy metadata

CLI must provide (flags, env, or embedded metadata):

- `org` (string)
- `app` (string)
- `releaseId` (unique string)
- `entryCommand` (node start command)
- `port` (optional; auto-allocated from 3001 if omitted, reuses existing port on redeploy)
- `healthPath` (default `/health`)
- `routeMode` (`subdomain`, `path`, or `both`; default `subdomain`)
- `basePath` (optional; defaults to `/<org>/<app>` when `routeMode` includes `path`)
- `customDomain` (optional)

## Host-side actions

Host deploy command consumes the fields above and must:

1. Extract artifact to `/opt/last-host/apps/<org>/<app>/releases/<releaseId>/`
2. Atomically switch `current` symlink
3. Ensure `last-host-<org>-<app>.service` points at `current`
4. Restart service and run health check
5. Update Caddy route map for subdomain routing, path routing, and optional custom domain

## Result contract

On success, host emits:

- `status=ok`
- `activeReleaseId=<releaseId>`
- `defaultUrl=<primary deploy URL>`
- `subdomainUrl=<optional>`
- `pathUrl=<optional>`
- `customUrl=<optional>`

On failure, host emits:

- `status=error`
- `failedStep=<step-name>`
- `message=<human-readable reason>`
