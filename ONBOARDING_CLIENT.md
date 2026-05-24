# last-host client onboarding

This guide covers client-side setup, SSH authentication, and first deploy.

## 1. Configure SSH authentication

Create a deploy key if you do not already have one:

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

## 2. Install the client CLI

On the client machine, install the CLI globally from npm:

```bash
npm install -g @incremental-code/last-host-cli
```

That makes the `last-host` command available locally.

## 3. Deploy an app

From an app project directory:

```bash
last-host deploy --org demo --app ecommerce --host lastjs.org --ssh-user deploy --ssh-key ~/.ssh/last_host_deploy
```

Useful URL examples:

### Path-based route

```bash
last-host deploy \
  --org demo \
  --app ecommerce \
  --host lastjs.org \
  --url https://lastjs.org/demo/ecommerce \
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
  --url https://ecommerce.demo.lastjs.org \
  --ssh-user deploy \
  --ssh-key ~/.ssh/last_host_deploy
```

Result:

```text
https://ecommerce.demo.lastjs.org
```

### Custom domain route

```bash
last-host deploy \
  --org demo \
  --app ecommerce \
  --host lastjs.org \
  --url https://shop.example.com \
  --ssh-user deploy \
  --ssh-key ~/.ssh/last_host_deploy
```

Result:

```text
https://shop.example.com
```
