#!/usr/bin/env bash
# Robertson Workflow Setup Script (v3)
# ---------------------------------------------------------------------------
# * Works out‑of‑the‑box in Codex CI / any other root‑run CI.
# * Still warns **locally** if you try to run it as root — but never exits in CI.
#   (CI systems usually set $CI=true; Codex does as well.)
# ---------------------------------------------------------------------------
set -euo pipefail

printf '\n\033[1m🚀  Robertson Workflow Setup\033[0m\n'

# ────────────────────────────────────────────────────────────────────────────
# 1. Warn (but do not exit) if running as root on a dev machine.
#    We allow UID 0 when $CI is set (Codex / GitHub Actions / etc.).
# ────────────────────────────────────────────────────────────────────────────
if [[ "$(id -u)" == "0" && -z "${CI:-}" ]]; then
  echo "⚠️  You are running as root. That's fine in CI but not recommended on a laptop."
fi

# ────────────────────────────────────────────────────────────────────────────
# 2. Ensure .env exists (copy from example on first run)
# ────────────────────────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "🔧 Created .env file from .env.example"
fi

# ────────────────────────────────────────────────────────────────────────────
# 3. Install Node dependencies (quiet, reproducible)
# ────────────────────────────────────────────────────────────────────────────
if [[ -f package.json ]]; then
  echo "📦 Installing Node.js dependencies …"
  npm ci --prefer-offline --no-audit --progress=false
  echo "✅ Node.js dependencies installed"
fi

# ────────────────────────────────────────────────────────────────────────────
# 4. Create runtime folders
# ────────────────────────────────────────────────────────────────────────────
mkdir -p logs data/exports

# ────────────────────────────────────────────────────────────────────────────
# 5. Secure perms (keep secrets private; make *.sh callable)
# ────────────────────────────────────────────────────────────────────────────
chmod 600 .env   || true
chmod +x *.sh    || true

# ────────────────────────────────────────────────────────────────────────────
# 6. Local‑only Docker setup (skipped in Codex because $CI is set)
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
# 7. Finish
# ────────────────────────────────────────────────────────────────────────────
cat << 'EOF'

✨ Setup complete!

Next steps:
  1. Review & update .env with your own API keys / secrets
  2. Start the app:  npm start
  3. Run tests:      npm test
EOF

exit 0
