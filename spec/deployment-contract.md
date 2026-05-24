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
- `url` (single public URL; defaults to the generated subdomain URL when omitted)

## Host-side actions

Host deploy command consumes the fields above and must:

1. Extract artifact to `/opt/last-host/apps/<org>/<app>/releases/<releaseId>/`
2. Atomically switch `current` symlink
3. Ensure `last-host-<org>-<app>.service` points at `current`
4. Restart service and run health check
5. Update Caddy route map for exactly one public URL

## Result contract

On success, host emits:

- `status=ok`
- `activeReleaseId=<releaseId>`
- `url=<deploy URL>`

On failure, host emits:

- `status=error`
- `failedStep=<step-name>`
- `message=<human-readable reason>`
