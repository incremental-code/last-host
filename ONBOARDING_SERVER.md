# last-host server onboarding

This guide takes you from a fresh Linux server to a working `last-host` host runtime.

## 1. Prerequisites

You need:

- a Linux VPS reachable over SSH
- a DNS record pointing your deploy hostname at the server
- `systemd` available on the server

## 2. Install with the automated install script (recommended)

Run the install script from this repository:

```bash
curl -fsSL https://raw.githubusercontent.com/incremental-code/last-host/main/scripts/install-server.sh | sudo bash
```

The script installs server dependencies, provisions the `deploy` user, and installs `last-host-server` with `npm link` for that user. It uses distro `apt` packages for Node.js/NPM; if you require a newer Node.js version, install that first before running the script.

## 3. Manual install (alternative)

If you are not using the install script, run these steps manually.

### 3.1 Install runtime dependencies

```bash
sudo apt update
sudo apt install -y nodejs npm sqlite3 caddy openssh-server tar git
```

### 3.2 Create the deploy user and host directories

```bash
sudo useradd -m -s /bin/bash deploy
sudo mkdir -p /opt/last-host
sudo chown -R deploy:deploy /opt/last-host
```

### 3.3 Install `last-host-server`

```bash
cd /opt
sudo -u deploy git clone https://github.com/incremental-code/last-host.git last-host-src
cd /opt/last-host-src
sudo -u deploy npm install
sudo -u deploy npm link --workspace packages/server
```

That makes `last-host-server` available to the `deploy` user.

## 4. Allow the deploy user to manage services and Caddy

`last-host-server` uses `sudo` to write systemd units, reload systemd, and reload Caddy. Add a sudoers file like this:

```bash
sudo tee /etc/sudoers.d/last-host-deploy >/dev/null <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/bin/mkdir, /usr/bin/tee, /usr/bin/systemctl, /usr/bin/caddy
EOF
sudo chmod 440 /etc/sudoers.d/last-host-deploy
```

If your distro installs these binaries elsewhere, adjust the paths first with `command -v mkdir tee systemctl caddy`.

## 5. Initialize the host

Choose the public hostname you want this server to answer on and initialize the runtime state:

```bash
sudo systemctl enable --now caddy
sudo -u deploy last-host-server init --host-id lastjs.org --hostname lastjs.org
```

- `--host-id` is the host identifier stored by `last-host`
- `--hostname` is the real DNS hostname used for generated URLs and Caddy config

For a real deployment host like `lastjs.org`, use the real hostname for both.

## 6. What stays running

These components must stay running on the server:

- `caddy`
- each deployed app's `last-host-<org>-<app>.service`

`last-host-server` does **not** run as a permanent daemon. It is invoked over SSH during deploys, rollbacks, and host management commands.

## 7. Day-two operations

- app logs: `journalctl -u last-host-<org>-<app>.service`
- Caddy status: `sudo systemctl status caddy`
- rollback: `last-host-server rollback --host-id <host> --org <org> --app <app>`
