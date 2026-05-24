#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/incremental-code/last-host.git"
SOURCE_DIR="/opt/last-host-src"
HOST_ROOT="/opt/last-host"

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

apt update
apt install -y nodejs npm sqlite3 caddy openssh-server tar git

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

echo "Server runtime installed. Next: configure sudoers and run last-host-server init."
