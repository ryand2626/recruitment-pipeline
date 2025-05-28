#!/bin/bash

# Start the Job Outreach Pipeline System
echo "🚀 Starting Job Outreach Pipeline System..."

# Check if PostgreSQL is running
if ! docker ps | grep -q "jobs-pipeline-postgres"; then
    echo "❌ PostgreSQL database is not running. Please start it with: docker-compose up -d postgres"
    exit 1
fi

echo "✅ Database is running"

# Kill any existing processes
echo "🧹 Cleaning up existing processes..."
pkill -f "node index.js" 2>/dev/null || true
pkill -f "streamlit run app_spreadsheet.py" 2>/dev/null || true

# Start backend API
echo "🔧 Starting backend API on port 3001..."
POSTGRES_HOST=localhost POSTGRES_PORT=5435 POSTGRES_DB=jobspipeline POSTGRES_USER=jobsadmin POSTGRES_PASSWORD=X2tP9vR7sQ4mE5jL8kF3wA6bC1dN0pZ node index.js &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to start..."
sleep 5

# Check if backend is healthy
if curl -s http://localhost:3001/health | grep -q "healthy"; then
    echo "✅ Backend API is healthy"
else
    echo "❌ Backend API failed to start properly"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

# Start Streamlit spreadsheet UI
echo "📊 Starting Streamlit spreadsheet UI on port 8502..."
streamlit run app_spreadsheet.py --server.port 8502 &
STREAMLIT_PID=$!

# Wait for Streamlit to start
echo "⏳ Waiting for Streamlit to start..."
sleep 5

echo ""
echo "🎉 System started successfully!"
echo ""
echo "📊 Spreadsheet UI: http://localhost:8502"
echo "🔧 Backend API: http://localhost:3001"
echo "🏥 Health Check: http://localhost:3001/health"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $STREAMLIT_PID 2>/dev/null || true
    pkill -f "node index.js" 2>/dev/null || true
    pkill -f "streamlit run app_spreadsheet.py" 2>/dev/null || true
    echo "✅ All services stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for processes
wait 