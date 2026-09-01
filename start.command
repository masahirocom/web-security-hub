#!/usr/bin/env bash
# Double-clickable launcher (macOS). Sets up the environment (installs
# Node.js if missing, npm deps, the Playwright Chromium browser), opens the
# browser UI, then runs the server.
set -uo pipefail
cd "$(dirname "$0")"

# Pinned to the exact version this app is developed/tested against, so a
# fresh auto-install always matches — not "whatever is newest today", which
# would drift over time and could behave subtly differently.
PINNED_NODE_VERSION="22.15.0"
REQUIRED_MAJOR=22

pause_and_exit() {
  read -r -p "Press Enter to close..." _
  exit 1
}

node_version_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  [ "${major}" -ge "${REQUIRED_MAJOR}" ]
}

install_node_via_brew() {
  if ! command -v brew >/dev/null 2>&1; then return 1; fi
  echo "Homebrew found — installing the pinned Node.js @${REQUIRED_MAJOR} via Homebrew..."
  brew install "node@${REQUIRED_MAJOR}" && brew link --overwrite --force "node@${REQUIRED_MAJOR}"
}

install_node_via_pkg() {
  echo "Homebrew not found (or node@${REQUIRED_MAJOR} unavailable) — downloading the"
  echo "official Node.js v${PINNED_NODE_VERSION} installer instead (matches the exact"
  echo "version this app is tested against)."
  local pkg_url tmp_pkg
  pkg_url="https://nodejs.org/dist/v${PINNED_NODE_VERSION}/node-v${PINNED_NODE_VERSION}.pkg"
  tmp_pkg="$(mktemp -t node-installer).pkg"
  echo "Downloading ${pkg_url} ..."
  if ! curl -fsSL "${pkg_url}" -o "${tmp_pkg}"; then
    echo "Download failed."
    return 1
  fi
  echo "Installing Node.js (this asks for your Mac password — it's the standard macOS installer prompt)..."
  sudo installer -pkg "${tmp_pkg}" -target /
  local status=$?
  rm -f "${tmp_pkg}"
  return ${status}
}

if ! node_version_ok; then
  echo "Node.js ${REQUIRED_MAJOR}+ was not found — setting it up automatically."
  if ! install_node_via_brew && ! install_node_via_pkg; then
    echo ""
    echo "Automatic install didn't work. Please install Node.js ${REQUIRED_MAJOR}+"
    echo "manually from https://nodejs.org/ and re-run this script."
    open "https://nodejs.org/" 2>/dev/null || true
    pause_and_exit
  fi
  # A freshly installed Node isn't reliably on PATH inside this same shell
  # (Homebrew's shellenv, /usr/local/bin vs /opt/homebrew/bin, etc.), so
  # rather than guess, ask for one more double-click — the next launch will
  # pick it up correctly via a fresh shell/PATH.
  hash -r
  if ! node_version_ok; then
    echo ""
    echo "Node.js was installed. Please double-click start.command once more to continue"
    echo "(this refreshes your PATH so this launcher can find it)."
    pause_and_exit
  fi
fi

echo "Using $(node -v)."

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Ensuring Playwright's Chromium browser is installed..."
npx playwright install chromium || true

PORT="${PORT:-4173}"
URL="http://localhost:${PORT}"

( sleep 2 && open "${URL}" ) &

echo "Starting server at ${URL} ..."
PORT="${PORT}" node server/index.js
