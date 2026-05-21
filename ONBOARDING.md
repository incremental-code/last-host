# last-host onboarding

This guide takes you from a fresh Linux server to a working `last-host` install, then shows how to authenticate and deploy from a client machine.

## 1. Server prerequisites

On the server, install the runtime dependencies:

```bash
sudo apt update
sudo apt install -y nodejs npm sqlite3 caddy openssh-server tar git
```

You also need:

- a Linux VPS reachable over SSH
- a DNS record pointing your deploy hostname at the server
- `systemd` available on the server

## 2. Create the deploy user and host directories

```bash
sudo useradd -m -s /bin/bash deploy
sudo mkdir -p /opt/last-host
sudo chown -R deploy:deploy /opt/last-host
```

## 3. Install `last-host` on the server

Clone the repository somewhere readable by the `deploy` user, install dependencies, and expose the host runtime binary:

```bash
cd /opt
sudo -u deploy git clone <your-last-host-repo-url> last-host-src
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

## 6. Configure SSH authentication from the client

On the client machine, create a deploy key if you do not already have one:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/last_host_deploy
```

Install the public key for the `deploy` user on the server:

```bash
ssh-copy-id -i ~/.ssh/last_host_deploy.pub deploy@lastjs.org
```

Or append the public key manually to `~deploy/.ssh/authorized_keys`.

Test SSH access before using the CLI:

```bash
ssh -i ~/.ssh/last_host_deploy deploy@lastjs.org
```

`last-host` uses SSH/SCP only. There is no separate API token or login flow.

## 7. Install the client CLI

On the client machine, install the CLI from this repository:

```bash
git clone <your-last-host-repo-url>
cd last-host
npm install
npm link --workspace packages/cli
```

That makes the `last-host` command available locally.

## 8. Deploy an app

From an app project directory:

```bash
last-host deploy --org demo --app ecommerce --host lastjs.org --ssh-user deploy --ssh-key ~/.ssh/last_host_deploy
```

Useful routing examples:

### Path-based route

```bash
last-host deploy \
  --org demo \
  --app ecommerce \
  --host lastjs.org \
  --route-mode path \
  --ssh-user deploy \
  --ssh-key ~/.ssh/last_host_deploy
```

Result:

```text
https://lastjs.org/demo/ecommerce
```

### Subdomain route

```bash
last-host deploy \
  --org demo \
  --app ecommerce \
  --host lastjs.org \
  --route-mode subdomain \
  --ssh-user deploy \
  --ssh-key ~/.ssh/last_host_deploy
```

Result:

```text
https://ecommerce.demo.lastjs.org
```

### Both default routes plus a custom domain

```bash
last-host deploy \
  --org demo \
  --app ecommerce \
  --host lastjs.org \
  --route-mode both \
  --custom-domain shop.example.com \
  --ssh-user deploy \
  --ssh-key ~/.ssh/last_host_deploy
```

Results:

```text
https://lastjs.org/demo/ecommerce
https://ecommerce.demo.lastjs.org
https://shop.example.com
```

## 9. What stays running

These components must stay running on the server:

- `caddy`
- each deployed app's `last-host-<org>-<app>.service`

`last-host-server` does **not** run as a permanent daemon. It is invoked over SSH during deploys, rollbacks, and host management commands.

## 10. Day-two operations

- app logs: `journalctl -u last-host-<org>-<app>.service`
- Caddy status: `sudo systemctl status caddy`
- rollback: `last-host-server rollback --host-id <host> --org <org> --app <app>`

