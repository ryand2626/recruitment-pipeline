#!/usr/bin/env bash
# Robertson Workflow Setup Script (v2) – ready for both local use & Codex CI
# ---------------------------------------------------------------------------
# * Works when Codex launches the repo (runs as root, no Docker daemon).
# * Still keeps the “don’t‑run‑as‑root” guard for local laptops.
# * Detects Codex through $CODEX env‑var (set this to "true" in the Codex UI).
# ---------------------------------------------------------------------------
set -euo pipefail

printf '\n\033[1m🚀  Robertson Workflow Setup\033[0m\n'  # bold header

# ────────────────────────────────────────────────────────────────────────────
# 1. Abort if running as root on a *developer machine* (Codex always runs UID0)
# ────────────────────────────────────────────────────────────────────────────
if [[ -z "${CODEX:-}" && "$(id -u)" == "0" ]]; then
  echo "❌ Please don't run this script as root. Use a normal user account."
  exit 1
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
# 4. Create standard runtime folders
# ────────────────────────────────────────────────────────────────────────────
mkdir -p logs data/exports

# ────────────────────────────────────────────────────────────────────────────
# 5. Secure perms (keep secrets private; make *.sh callable)
# ────────────────────────────────────────────────────────────────────────────
chmod 600 .env || true
chmod +x *.sh    || true

# ────────────────────────────────────────────────────────────────────────────
# 6. Environment‑specific extras
# ────────────────────────────────────────────────────────────────────────────
if [[ -n "${CODEX:-}" ]]; then
  echo "🌐 Detected Codex CI environment – skipping local Docker setup"
  echo "    (service containers are defined in .codex.yml)"
else
  if command -v docker &>/dev/null && docker info &>/dev/null; then
    echo "🐳 Docker detected – building local image & starting compose services"
    docker build -t robertson-workflow .
    if [[ -f docker-compose.yml ]]; then
      docker-compose up -d
    fi
  else
    echo "⚠️  Docker not available. Proceeding without containerised services."
  fi
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
