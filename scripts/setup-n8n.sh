#!/bin/bash

echo "🚀 Setting up n8n with PostgreSQL + MongoDB Atlas"
echo "=================================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Stop and remove existing containers to avoid conflicts
echo "🧹 Cleaning up existing containers..."
docker-compose down -v 2>/dev/null || true

# Remove n8n data volume to clear encryption key
echo "🗑️  Removing old n8n data..."
docker volume rm alumni-portal-n8n_data 2>/dev/null || true
docker volume rm openalumns_n8n_data 2>/dev/null || true

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p n8n/workflows
mkdir -p n8n/backup
mkdir -p api

# Generate encryption key
echo "🔐 Generating encryption key..."
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Check if .env exists and backup
if [ -f .env ]; then
    echo "📦 Backing up existing .env..."
    cp .env .env.backup.$(date +%Y%m%d%H%M%S)
fi

# Update or create .env file
echo "📝 Updating .env file..."

# Remove old n8n config if exists
sed -i.bak '/^N8N_/d' .env 2>/dev/null || true
sed -i.bak '/^DB_TYPE/d' .env 2>/dev/null || true

# Add new configuration
cat >> .env << EOF

# n8n Configuration (Generated: $(date))
N8N_ENCRYPTION_KEY=${ENCRYPTION_KEY}
N8N_HOST=localhost
N8N_PORT=5678
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=changeme123

# PostgreSQL for n8n
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=postgres
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_USER=n8n
DB_POSTGRESDB_PASSWORD=n8n_password_change_this
EOF

echo "✅ Configuration complete!"
echo ""
echo "🚀 Starting services..."

# Use docker compose (newer) or docker-compose (older)
if docker compose version &> /dev/null 2>&1; then
    docker compose up -d
else
    docker-compose up -d
fi

echo ""
echo "⏳ Waiting for services to be ready (45 seconds)..."
sleep 45

# Check service health
echo ""
echo "🔍 Checking service health..."
echo ""

# Check PostgreSQL
if docker exec alumni-portal-postgres pg_isready -U n8n &> /dev/null; then
    echo "✅ PostgreSQL is running"
else
    echo "⚠️  PostgreSQL is starting up..."
fi

# Check n8n
if curl -s http://localhost:5678 > /dev/null; then
    echo "✅ n8n is running at http://localhost:5678"
else
    echo "⚠️  n8n is still starting... (check logs: docker logs alumni-portal-n8n)"
fi

# Check Scraper API
if curl -s http://localhost:5000/health > /dev/null; then
    echo "✅ Scraper API is running at http://localhost:5000"
else
    echo "⚠️  Scraper API is not accessible"
fi

# Check Mongo Express
if curl -s http://localhost:8081 > /dev/null; then
    echo "✅ Mongo Express is running at http://localhost:8081"
else
    echo "⚠️  Mongo Express is not accessible (this is optional)"
fi

# Check Redis
if docker exec alumni-portal-redis redis-cli ping &> /dev/null; then
    echo "✅ Redis is running"
else
    echo "⚠️  Redis is not accessible"
fi

echo ""
echo "=================================================="
echo "✅ Setup complete!"
echo "=================================================="
echo ""
echo "📊 Access Points:"
echo ""
echo "  🔧 n8n Workflow Automation"
echo "     URL: http://localhost:5678"
echo "     Username: admin"
echo "     Password: changeme123"
echo ""
echo "  🐍 Scraper API"
echo "     URL: http://localhost:5000"
echo "     Health: http://localhost:5000/health"
echo ""
echo "  🗄️  Mongo Express (MongoDB Atlas UI)"
echo "     URL: http://localhost:8081"
echo "     Username: admin"
echo "     Password: admin123"
echo ""
echo "  🐘 PostgreSQL (n8n Database)"
echo "     Host: localhost:5432"
echo "     Database: n8n"
echo "     Username: n8n"
echo ""
echo "📚 Next Steps:"
echo ""
echo "  1. Open n8n: http://localhost:5678"
echo "  2. Login with admin / changeme123"
echo "  3. Go to Credentials → Add Credential"
echo "  4. Add MongoDB credential:"
echo "     - Type: MongoDB"
echo "     - Connection String: mongodb+srv://kushasrani_db_user:..."
echo "     - Database: alumni_portal"
echo "  5. Import workflow: n8n/workflows/job-scraper-mongodb.json"
echo "  6. Test workflow execution"
echo ""
echo "📝 Useful Commands:"
echo ""
echo "  View logs:       docker-compose logs -f"
echo "  Stop services:   docker-compose down"
echo "  Restart n8n:     docker-compose restart n8n"
echo "  View n8n logs:   docker logs -f alumni-portal-n8n"
echo ""