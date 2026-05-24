#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/incremental-code/last-host.git"
SOURCE_DIR="/opt/last-host-src"
HOST_ROOT="/opt/last-host"
MIN_NODE_MAJOR="${MIN_NODE_MAJOR:-18}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-url)
      REPO_URL="$2"
      shift 2
      ;;
    --source-dir)
      SOURCE_DIR="$2"
      shift 2
      ;;
    --host-root)
      HOST_ROOT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root (use sudo)." >&2
  exit 1
fi

if ! command -v apt >/dev/null 2>&1; then
  echo "Unsupported distribution: apt is required for this installer. For other distributions, use ONBOARDING_SERVER.md section '3. Manual install (alternative)'." >&2
  exit 1
fi

if ! apt update; then
  echo "Failed to refresh apt package indexes." >&2
  exit 1
fi

if ! apt install -y nodejs npm sqlite3 caddy openssh-server tar git; then
  echo "Failed to install required packages." >&2
  exit 1
fi

node_major="$(node -p "process.versions.node.split(\".\")[0]")"
if [[ "${node_major}" -lt "${MIN_NODE_MAJOR}" ]]; then
  echo "Warning: detected Node.js ${node_major}.x from apt; minimum recommended is ${MIN_NODE_MAJOR}.x." >&2
fi

if ! id -u deploy >/dev/null 2>&1; then
  useradd -m -s /bin/bash deploy
fi

mkdir -p "${HOST_ROOT}"
chown -R deploy:deploy "${HOST_ROOT}"

src_parent="$(dirname "${SOURCE_DIR}")"
mkdir -p "${src_parent}"
chown deploy:deploy "${src_parent}"

if [[ -d "${SOURCE_DIR}/.git" ]]; then
  sudo -u deploy git -C "${SOURCE_DIR}" pull --ff-only
else
  sudo -u deploy git clone "${REPO_URL}" "${SOURCE_DIR}"
fi

sudo -u deploy npm --prefix "${SOURCE_DIR}" install
sudo -u deploy npm --prefix "${SOURCE_DIR}" link --workspace packages/server

server_command_path="$(sudo -iu deploy command -v last-host-server || true)"
echo "Server runtime installed. This uses npm link for the deploy user (global symlink)."
if [[ -n "${server_command_path}" ]]; then
  echo "Verified last-host-server at: ${server_command_path}"
else
  echo "Warning: last-host-server was not found in deploy user PATH." >&2
fi
echo "Next: configure sudoers and run last-host-server init."
