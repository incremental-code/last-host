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
- `port` (internal local port app listens on)
- `healthPath` (default `/health`)
- `customDomain` (optional)

## Host-side actions

Host deploy command consumes the fields above and must:

1. Extract artifact to `/opt/last-host/apps/<org>/<app>/releases/<releaseId>/`
2. Atomically switch `current` symlink
3. Ensure `last-host-<org>-<app>.service` points at `current`
4. Restart service and run health check
5. Update Caddy route map for default path routing and optional custom domain

## Result contract

On success, host emits:

- `status=ok`
- `activeReleaseId=<releaseId>`
- `defaultUrl=https://<host>/<org>/<app>`
- `customUrl=<optional>`

On failure, host emits:

- `status=error`
- `failedStep=<step-name>`
- `message=<human-readable reason>`
