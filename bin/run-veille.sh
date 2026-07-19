#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

export PATH="/home/obinduarc/.nvm/versions/node/v20.17.0/bin:$PATH"

node src/index.js
