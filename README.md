# last-host

`last-host` is a VPS-hosted deployment target for `last-*` apps. v1 prioritizes simple, understandable operations over horizontal scale: one VPS, Node processes managed by systemd, Caddy for ingress/TLS, and SQLite for persistent state.

**Start here:** [Server onboarding](./ONBOARDING_SERVER.md) and [client onboarding](./ONBOARDING_CLIENT.md).

## Architecture overview (v1)

- **Topology:** single Linux VPS
- **Runtime:** app code runs directly with `node` (no Docker)
- **Process supervision:** one `systemd` service per deployed app
- **Ingress:** Caddy reverse proxy with automatic TLS
- **Deploy transport:** local build, tarball upload via SSH/SCP
- **State:** SQLite on local disk
- **Static assets:** served from host filesystem

## Suggested VPS layout (`/opt/last-host`)

```text
/opt/last-host/
  apps/
    <org>/<app>/
      releases/
        <release-id>/
          app/                  # extracted build output
          static/               # static files for this release
          metadata.json
      current -> releases/<release-id>
      shared/
        data/                   # SQLite db, app writable files
        config/
      logs/                     # optional app-specific log files
  caddy/
    Caddyfile
  deploy/
    incoming/                   # uploaded tarballs before extraction
```

Atomic releases are represented by immutable `releases/<release-id>` directories and a `current` symlink switch.

## Request routing behavior

### Default routes
Deploys can choose one of three default routing modes:

- `subdomain` (default): `https://<app>.<org>.<host>`
- `path`: `https://<host>/<org>/<app>`
- `both`: enables both of the routes above

Examples:

- `https://storefront.acme.apps.example.com/products/1`
  - routes to app `acme/storefront`
  - app receives path `/products/1`
- `https://apps.example.com/acme/storefront/products/1`
  - routes to app `acme/storefront`
  - app receives path `/products/1`

### Custom domain (optional)

If an app is bound to a custom domain, Caddy matches that host directly and routes to the same app without requiring either the subdomain pattern or `/org/app-name` prefix.

Example:

- `https://shop.acme.com/products/1` routes to `acme/storefront`.

## Deploy flow and rollback model

1. Build app locally.
2. Package deploy artifact as tarball (app output + static files + manifest metadata).
3. Upload artifact to VPS via SCP over SSH key auth.
4. VPS deploy script:
   - validates artifact
   - creates `releases/<release-id>`
   - extracts files
   - links shared persistent paths as needed
   - updates `current` symlink atomically
   - restarts app `systemd` service
5. Health check determines success/failure.

Rollback: switch `current` symlink back to a prior release and restart the same service. No rebuild required.

## Security model and assumptions

- **SSH key auth only** (password auth disabled)
- Deploy user has least-privilege permissions for app directories and service restart commands
- TLS terminated by Caddy with auto-managed certificates
- Apps run as non-root service users
- SQLite files and shared state stored with restrictive filesystem permissions
- Assumes a trusted operator controls VPS hardening, firewalling, patching, and backups

## Operational notes

- **Logs:** use `journalctl -u last-host-<org>-<app>.service` as primary source; optional file logs in app `logs/`
- **Backups:** snapshot `/opt/last-host/apps/*/*/shared/data/` (SQLite + uploads) and deployment metadata
- **Restore:** recover shared data first, then point `current` to desired release and restart service
- **Certs/routing:** Caddy config should be version-controlled and reloaded with validation

## Host runtime commands (v1)

`packages/server` provides `last-host-server` for SSH-invoked host actions:

- `init --host-id <id> --hostname <name> [--root-dir /opt/last-host]`
- `prepare-release --host-id <id> --org <org> --app <app> --release-id <id> --artifact <tar.gz> --entry-command "node app/server.js" [--port <n>] [--url <public-url>]`
- `activate-release --host-id <id> --org <org> --app <app> --release-id <id> [--url <public-url>]`
- `rollback --host-id <id> --org <org> --app <app> [--to-release-id <id>]`
- `set-env --org <org> --app <app> --<KEY> <value> [--<KEY2> <value2> ...]`
- `unset-env --org <org> --app <app> --keys <KEY1,KEY2,...>`
- `get-env --org <org> --app <app>`

The runtime manages atomic `current` symlink switches, systemd unit reconciliation, Caddy config generation/reload, and SQLite runtime state updates.

## Port allocation

Ports are auto-allocated starting from 3001 on first deploy. Each app gets a unique port stored in SQLite with a UNIQUE constraint. The allocated port is passed to the app as the `PORT` environment variable via the systemd unit. Subsequent deploys of the same app reuse its existing port.

Apps must listen on `process.env.PORT` (or the `PORT` env var in their language) to be compatible.

## Environment variables

Each app can have environment variables managed via the `set-env` / `unset-env` commands. These are stored in SQLite and written to a `.env` file at `<app>/shared/config/.env`. The systemd unit loads this file via `EnvironmentFile`, so changes take effect on next service restart.

You can also upload a `.env` file during deploy with `--env-file <path>`, which copies the local file to the app's shared config directory.

## Explicit non-goals for v1

- Multi-node orchestration or auto-scaling
- Container runtime support (Docker/Kubernetes)
- Remote/host-side build pipeline
- Zero-downtime schema migration framework
- Multi-region failover

## CLI deploy flow (v1)

From an app project directory:

```bash
last-host build [--app <name>] [--output <artifact-path>]
last-host deploy --org <org> --host <host> [--app <name>] [--url <public-url>] [--env-file <path>]
```

`deploy` builds/packages locally, uploads via SCP, then calls remote `last-host-server prepare-release` and `activate-release` over SSH.

Useful deploy flags/env:

- `--ssh-user` / `LAST_HOST_SSH_USER` (default `deploy`)
- `--ssh-host` / `LAST_HOST_SSH_HOST` (default `--host`)
- `--ssh-port` / `LAST_HOST_SSH_PORT` (default `22`)
- `--ssh-key` / `LAST_HOST_SSH_KEY`
- `--remote-root` / `LAST_HOST_REMOTE_ROOT` (default `/opt/last-host`)
- `--remote-cli` / `LAST_HOST_REMOTE_CLI` (default `last-host-server`)
- `--url` / `LAST_HOST_URL` — single public URL for the app; defaults to the generated subdomain URL
- `--env-file` — path to a local `.env` file to upload to the app's shared config

App name defaults from `package.json` `name` (scope stripped + normalized), overridable via `--app`.
