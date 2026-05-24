# @incremental-code/last-host-server

Host runtime CLI for `last-host`.

## Install

```bash
npm install -g @incremental-code/last-host-server
```

## Usage

```bash
last-host-server init --host-id example.com --hostname example.com
last-host-server prepare-release --host-id example.com --org demo --app shop --release-id r1 --artifact /tmp/release.tgz
last-host-server activate-release --host-id example.com --org demo --app shop --release-id r1
```

## Notes

- Intended for installation on the deployment host
- Uses `sudo` for systemd and Caddy integration
- Depends on `@incremental-code/last-host-shared`
