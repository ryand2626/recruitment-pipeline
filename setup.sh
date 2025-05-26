#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Robertson Workflow Setup"

# Check if running as root
if [ "$(id -u)" -eq 0 ]; then
    echo "❌ Please don't run this script as root. Run as a normal user."
    exit 1
fi

# Create .env if it doesn't exist
test -f .env || { cp .env.example .env && echo "🔧 Created .env file"; }

# Install Node.js dependencies if package.json exists
if [ -f "package.json" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm ci --prefer-offline --no-audit --progress=false
    echo "✅ Node.js dependencies installed"
fi

# Create necessary directories
mkdir -p logs data/exports

# Set file permissions (600 for .env, executable for .sh files)
chmod 600 .env
chmod +x *.sh

# Check if we're running in Codex environment
if [ "${CODEX:-}" = "true" ]; then
    echo "🌐 Running in Codex environment"
    echo "   Using services defined in .codex.yml"
else
    # Local development setup
    if command -v docker &> /dev/null && docker info &> /dev/null; then
        echo "🐳 Setting up local Docker environment..."
        
        # Build the Docker image
        echo "   Building Docker image..."
        docker build -t robertson-workflow .
        
        # Start services with Docker Compose if available
        if [ -f "docker-compose.yml" ]; then
            echo "   Starting Docker containers..."
            docker-compose up -d
        fi
    else
        echo "⚠️  Docker not available. Running in minimal mode."
        echo "   Some services may not be available without Docker."
    fi
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
if [ -f ".env.example" ]; then
    echo "1. Review and update the .env file with your configuration"
fi
if [ -f "package.json" ]; then
    echo "2. Start the application with: npm start"
fi
echo ""

exit 0
