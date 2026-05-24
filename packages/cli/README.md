# @incremental-code/last-host-cli

Client CLI for building and deploying apps to `last-host`.

## Install

```bash
npm install -g @incremental-code/last-host-cli
```

## Usage

```bash
last-host build
last-host deploy --org demo --host example.com
```

## Notes

- Intended for installation on developer machines or CI runners
- Uses SSH/SCP to upload releases and invoke `last-host-server`
- Depends on `@incremental-code/last-host-shared`
