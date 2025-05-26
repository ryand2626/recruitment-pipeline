#!/usr/bin/env bash
# Robertson Workflow Setup Script (v5)
# ---------------------------------------------------------------------------
# • Works in Codex CI & locally.
# • Handles missing lock‑file.
# • Caps Node memory to avoid OOM kills in CI.
# • Installs without dev‑deps in CI to stay under time/disk limits.
# ---------------------------------------------------------------------------
set -euo pipefail

printf '\n\033[1m🚀  Robertson Workflow Setup\033[0m\n'

# 1. Warn (but don’t exit) if root on a laptop
if [[ "$(id -u)" == "0" && -z "${CI:-}" ]]; then
  echo "⚠️  You are running as root. That's fine in CI but not recommended locally."
fi

# 2. Ensure .env exists
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "🔧 Created .env file from .env.example"
fi

# 3. Install Node dependencies (with CI‑friendly tweaks)
if [[ -f package.json ]]; then
  echo "📦 Installing Node.js dependencies …"

  # a. Cap memory to 2 GB to prevent OOM kills in small runners
  export NODE_OPTIONS="--max_old_space_size=2048"

  # b. In CI, skip dev‑deps to shorten install (eslint, puppeteer, etc.)
  INSTALL_OPTS="--prefer-offline --no-audit --progress=false"
  if [[ -n "${CI:-}" ]]; then
    INSTALL_OPTS+=" --omit=dev"
  fi

  # c. Choose ci vs install based on lock‑file presence
  if [[ -f package-lock.json || -f npm-shrinkwrap.json ]]; then
    npm ci ${INSTALL_OPTS}
  else
    echo "🔑 No package‑lock.json found – using npm install & creating one."
    npm install ${INSTALL_OPTS}
  fi
  echo "✅ Node.js dependencies installed"
fi

# 4. Runtime folders & permissions
mkdir -p logs data/exports\chmod 600 .env || true
chmod +x *.sh || true

# 5. Docker setup (with CI-specific overrides)
if command -v docker &>/dev/null && docker info &>/dev/null; then
  echo "🐳 Docker detected – building local image & starting services"
  docker build -t robertson-workflow .
  
  if [[ -f docker-compose.yml ]]; then
    # In CI, use the override file to avoid port conflicts
    if [[ -n "${CI:-}" ]]; then
      echo "🌐 CI environment detected – using docker-compose.ci.yml overrides"
      if [[ -f docker-compose.ci.yml ]]; then
        docker-compose -f docker-compose.yml -f docker-compose.ci.yml up -d
      else
        docker-compose up -d
      fi
    else
      # Local development - check if ports are available
      if lsof -i :5432 &>/dev/null; then
        echo "⚠️  Port 5432 is in use. Make sure it's not another Postgres instance."
      fi
      if lsof -i :5678 &>/dev/null; then
        echo "⚠️  Port 5678 is in use. Make sure it's not another n8n instance."
      fi
      docker-compose up -d
    fi
  fi
elif [[ -z "${CI:-}" ]]; then
  echo "⚠️  Docker not available locally. Proceeding without containerised services."
fi

# 6. Finish
cat << 'EOF'

✨ Setup complete!

Next steps:
  1. Review & update .env with your own API keys / secrets
  2. Start the app:  npm start
  3. Run tests:      npm test
EOF

exit 0
