#!/bin/bash

echo "🔄 Resetting n8n..."
echo ""

# Stop all services
echo "🛑 Stopping services..."
docker-compose down

# Remove volumes
echo "🗑️  Removing volumes..."
docker volume rm alumni-portal-n8n_data 2>/dev/null || true
docker volume rm openalumns_n8n_data 2>/dev/null || true
docker volume rm alumni-portal-postgres_data 2>/dev/null || true

echo ""
echo "✅ Reset complete!"
echo ""
echo "Run './scripts/setup-n8n.sh' to start fresh"