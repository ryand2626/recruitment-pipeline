#!/bin/bash

echo "🔍 Job Outreach Pipeline - System Status Check"
echo "=============================================="

# Check PostgreSQL Database
echo "📊 Database Status:"
if docker ps | grep -q "jobs-pipeline-postgres"; then
    echo "  ✅ PostgreSQL container is running"
    if docker exec jobs-pipeline-postgres pg_isready -U jobsadmin -d jobspipeline >/dev/null 2>&1; then
        echo "  ✅ Database is accepting connections"
    else
        echo "  ❌ Database is not accepting connections"
    fi
else
    echo "  ❌ PostgreSQL container is not running"
fi

echo ""

# Check Backend API
echo "🔧 Backend API Status:"
if curl -s http://localhost:3001/health >/dev/null 2>&1; then
    HEALTH_STATUS=$(curl -s http://localhost:3001/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    if [ "$HEALTH_STATUS" = "healthy" ]; then
        echo "  ✅ Backend API is healthy (port 3001)"
        
        # Test jobs endpoint
        JOB_COUNT=$(curl -s "http://localhost:3001/api/jobs?limit=1" | grep -o '"total":[0-9]*' | cut -d':' -f2)
        if [ ! -z "$JOB_COUNT" ]; then
            echo "  ✅ Jobs API endpoint working (found $JOB_COUNT jobs)"
        else
            echo "  ⚠️  Jobs API endpoint may have issues"
        fi
    else
        echo "  ⚠️  Backend API is running but not healthy (status: $HEALTH_STATUS)"
    fi
else
    echo "  ❌ Backend API is not responding (port 3001)"
fi

echo ""

# Check Streamlit UI
echo "📊 Streamlit UI Status:"
if curl -s http://localhost:8502 >/dev/null 2>&1; then
    echo "  ✅ Spreadsheet UI is running (port 8502)"
    echo "  🌐 Access at: http://localhost:8502"
else
    echo "  ❌ Spreadsheet UI is not running (port 8502)"
fi

echo ""

# Check processes
echo "🔄 Running Processes:"
if pgrep -f "node index.js" >/dev/null; then
    echo "  ✅ Backend process is running"
else
    echo "  ❌ Backend process is not running"
fi

if pgrep -f "streamlit run app_spreadsheet.py" >/dev/null; then
    echo "  ✅ Streamlit process is running"
else
    echo "  ❌ Streamlit process is not running"
fi

echo ""
echo "=============================================="

# Overall status
if docker ps | grep -q "jobs-pipeline-postgres" && \
   curl -s http://localhost:3001/health | grep -q "healthy" && \
   curl -s http://localhost:8502 >/dev/null 2>&1; then
    echo "🎉 Overall Status: ALL SYSTEMS OPERATIONAL"
    echo ""
    echo "Quick Links:"
    echo "  📊 Spreadsheet UI: http://localhost:8502"
    echo "  🔧 Backend API: http://localhost:3001"
    echo "  🏥 Health Check: http://localhost:3001/health"
else
    echo "⚠️  Overall Status: SOME ISSUES DETECTED"
    echo ""
    echo "To start the system:"
    echo "  ./start-system.sh"
fi

echo "" 