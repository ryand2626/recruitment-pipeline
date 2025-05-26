#!/usr/bin/env bash
# Robertson Workflow Setup Script (v4)
# ---------------------------------------------------------------------------
# * Runs in Codex CI (UID 0) and locally (non‑root).
# * Falls back to `npm install` when the project has **no package‑lock.json**
#   (avoids the EUSAGE error you just hit).
# ---------------------------------------------------------------------------
set -euo pipefail

printf '\n\033[1m🚀  Robertson Workflow Setup\033[0m\n'

# ────────────────────────────────────────────────────────────────────────────
# 1. Warn (but don’t exit) if someone runs as root *on their laptop*
# ────────────────────────────────────────────────────────────────────────────
if [[ "$(id -u)" == "0" && -z "${CI:-}" ]]; then
  echo "⚠️  You are running as root. That's fine in CI but not recommended locally."
fi

# ────────────────────────────────────────────────────────────────────────────
# 2. Ensure .env exists
# ────────────────────────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "🔧 Created .env file from .env.example"
fi

# ────────────────────────────────────────────────────────────────────────────
# 3. Install Node dependencies
#    • If we have a lock‑file, use `npm ci` (fast, deterministic)
#    • Otherwise fall back to `npm install` to generate it.
# ────────────────────────────────────────────────────────────────────────────
if [[ -f package.json ]]; then
  echo "📦 Installing Node.js dependencies …"
  if [[ -f package-lock.json || -f npm-shrinkwrap.json ]]; then
    npm ci --prefer-offline --no-audit --progress=false
  else
    echo "🔑 No package‑lock.json found – using npm install & creating one."
    npm install --prefer-offline --no-audit --progress=false
  fi
  echo "✅ Node.js dependencies installed"
fi

# ────────────────────────────────────────────────────────────────────────────
# 4. Runtime folders & permissions
# ────────────────────────────────────────────────────────────────────────────
mkdir -p logs data/exports
chmod 600 .env   || true
chmod +x *.sh    || true

# ────────────────────────────────────────────────────────────────────────────
# 5. Local‑only Docker setup (skipped when $CI is set)
# ────────────────────────────────────────────────────────────────────────────
if [[ -z "${CI:-}" ]]; then
  if command -v docker &>/dev/null && docker info &>/dev/null; then
    echo "🐳 Docker detected – building local image & starting compose services"
    docker build -t robertson-workflow .
    if [[ -f docker-compose.yml ]]; then
      docker-compose up -d
    fi
  else
    echo "⚠️  Docker not available locally. Proceeding without containerised services."
  fi
else
  echo "🌐 CI environment detected – external services expected via .codex.yml"
fi

# ────────────────────────────────────────────────────────────────────────────
# 6. Finish
# ────────────────────────────────────────────────────────────────────────────
cat << 'EOF'

✨ Setup complete!

Next steps:
  1. Review & update .env with your own API keys / secrets
  2. Start the app:  npm start
  3. Run tests:      npm test
EOF

exit 0
