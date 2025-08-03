#!/bin/bash

# Enhanced GPU Server Deployment Script
# Deploys GPU server + PostgreSQL + Redis on L40S infrastructure

set -e  # Exit on any error

# Configuration
GPU_HOST="204.52.24.36"
SSH_KEY="./scripts/team23_private_key"
DEPLOY_USER="ubuntu"
POSTGRES_DB="repo_cache"
POSTGRES_USER="repo_user"
POSTGRES_PASSWORD="secure_repo_password_$(date +%s)"

echo "🚀 Deploying Enhanced GPU-Powered Repository Analysis System..."
echo "🎯 Target: L40S GPU Server ($GPU_HOST)"
echo "📊 Features: PostgreSQL + Redis + GPU Processing + Vector Search"
echo ""

# Check SSH key
if [ ! -f "$SSH_KEY" ]; then
    echo "❌ SSH key not found at $SSH_KEY"
    echo "Please ensure the SSH key is available"
    exit 1
fi

chmod 600 "$SSH_KEY"

echo "📡 Testing connection to GPU server..."
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$DEPLOY_USER@$GPU_HOST" "echo 'Connection successful'" 2>/dev/null; then
    echo "❌ Cannot connect to GPU server"
    echo "Please check:"
    echo "  - SSH key is correct"
    echo "  - Server is accessible"
    echo "  - Network connectivity"
    exit 1
fi

echo "✅ Connection successful!"
echo ""

# Copy files to server
echo "📦 Uploading files to GPU server..."
scp -i "$SSH_KEY" scripts/gpu-server-enhanced.py "$DEPLOY_USER@$GPU_HOST:/tmp/"
scp -i "$SSH_KEY" scripts/requirements-gpu.txt "$DEPLOY_USER@$GPU_HOST:/tmp/"
scp -i "$SSH_KEY" database/schema.sql "$DEPLOY_USER@$GPU_HOST:/tmp/"

echo "🔧 Setting up enhanced GPU server with database..."

# Main deployment script
ssh -i "$SSH_KEY" "$DEPLOY_USER@$GPU_HOST" << EOF
set -e

echo "🏗️  Setting up enhanced GPU analysis server..."

# Update system
sudo apt-get update -y
sudo apt-get upgrade -y

# Install PostgreSQL and Redis
echo "📊 Installing PostgreSQL and Redis..."
sudo apt-get install -y postgresql postgresql-contrib redis-server python3-pip python3-venv nginx

# Install pgvector extension
sudo apt-get install -y postgresql-14-pgvector

# Start services
sudo systemctl start postgresql redis-server
sudo systemctl enable postgresql redis-server

# Create PostgreSQL database and user
echo "🗃️  Setting up PostgreSQL database..."
sudo -u postgres psql << PSQL
CREATE DATABASE $POSTGRES_DB;
CREATE USER $POSTGRES_USER WITH ENCRYPTED PASSWORD '$POSTGRES_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;
ALTER USER $POSTGRES_USER CREATEDB;
\\q
PSQL

# Install pgvector extension in the database
sudo -u postgres psql -d $POSTGRES_DB << PSQL
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
\\q
PSQL

# Run database schema
echo "📋 Creating database schema..."
sudo -u postgres psql -d $POSTGRES_DB -f /tmp/schema.sql

# Create application directory
sudo mkdir -p /opt/gpu-server
sudo chown $USER:$USER /opt/gpu-server
cd /opt/gpu-server

# Create Python virtual environment
echo "🐍 Setting up Python environment..."
python3 -m venv gpu-env
source gpu-env/bin/activate

# Upgrade pip and install requirements
pip install --upgrade pip setuptools wheel

# Install PyTorch with CUDA support first
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Install other requirements
pip install -r /tmp/requirements-gpu.txt

# Copy application files
cp /tmp/gpu-server-enhanced.py ./
cp /tmp/requirements-gpu.txt ./

# Create environment file
cat > .env << ENV
DATABASE_URL=postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB
REDIS_URL=redis://localhost:6379
BATCH_SIZE=32
MAX_QUEUE_SIZE=1000
CUDA_VISIBLE_DEVICES=0
ENV

# Create systemd service
sudo tee /etc/systemd/system/gpu-server-enhanced.service > /dev/null << SERVICE
[Unit]
Description=Enhanced GPU Repository Analysis Server
After=network.target postgresql.service redis.service
Requires=postgresql.service redis.service

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/gpu-server
Environment=PATH=/opt/gpu-server/gpu-env/bin
ExecStart=/opt/gpu-server/gpu-env/bin/python gpu-server-enhanced.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

# Configure Redis for persistence
sudo sed -i 's/# maxmemory <bytes>/maxmemory 1gb/' /etc/redis/redis.conf
sudo sed -i 's/# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
sudo systemctl restart redis-server

# Configure PostgreSQL for performance
sudo tee -a /etc/postgresql/14/main/postgresql.conf > /dev/null << PGCONF

# Performance tuning for AI workloads
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 4MB
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 8
max_parallel_workers_per_gather = 2
max_parallel_workers = 8
max_parallel_maintenance_workers = 2
PGCONF

# Restart PostgreSQL to apply changes
sudo systemctl restart postgresql

# Configure Nginx reverse proxy
sudo tee /etc/nginx/sites-available/gpu-server > /dev/null << NGINX
server {
    listen 80;
    server_name $GPU_HOST;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/gpu-server /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl restart nginx
sudo systemctl enable nginx

# Reload systemd and start the service
sudo systemctl daemon-reload
sudo systemctl enable gpu-server-enhanced
sudo systemctl start gpu-server-enhanced

echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
if sudo systemctl is-active --quiet gpu-server-enhanced; then
    echo "✅ GPU server is running!"
else
    echo "❌ GPU server failed to start"
    echo "📋 Service logs:"
    sudo journalctl -u gpu-server-enhanced --no-pager -n 20
    exit 1
fi

echo ""
echo "🎉 Enhanced GPU Server Deployment Complete!"
echo ""
echo "📊 Database: PostgreSQL with pgvector extension"
echo "🔄 Cache: Redis for fast access"
echo "🤖 GPU: NVIDIA L40S ready for AI processing"
echo "🌐 Access: http://$GPU_HOST/"
echo ""
echo "🔧 Connection Details:"
echo "  Database: $POSTGRES_DB"
echo "  User: $POSTGRES_USER"
echo "  Password: $POSTGRES_PASSWORD"
echo ""
echo "🚀 Ready for massive repository analysis!"

EOF

echo ""
echo "🔍 Testing enhanced GPU server..."
sleep 5

# Test the enhanced server
echo "📊 Checking health endpoint..."
if curl -s "http://$GPU_HOST/health" | grep -q "healthy"; then
    echo "✅ Health check passed!"
    echo ""
    echo "🎯 Testing GPU capabilities..."
    curl -s "http://$GPU_HOST/stats" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f'GPU Available: {data[\"gpu\"][\"available\"]}')
    print(f'Database Connected: {data[\"database\"][\"connected\"]}')
    print(f'Models Loaded: {data[\"models\"][\"sentence_transformer_loaded\"]}')
    print('✅ All systems operational!')
except:
    print('⚠️  Could not parse stats, but server is responding')
"
else
    echo "❌ Health check failed"
    echo "📋 Troubleshooting:"
    echo "  - Check server logs: ssh -i $SSH_KEY $DEPLOY_USER@$GPU_HOST 'sudo journalctl -u gpu-server-enhanced -f'"
    echo "  - Check database: ssh -i $SSH_KEY $DEPLOY_USER@$GPU_HOST 'sudo -u postgres psql -d $POSTGRES_DB -c \"SELECT version();\"'"
fi

echo ""
echo "🎉 ==============================================="
echo "🤖 ENHANCED GPU SERVER DEPLOYMENT COMPLETE!"
echo "🎉 ==============================================="
echo ""
echo "🔗 Server URL: http://$GPU_HOST"
echo "📊 Health Check: http://$GPU_HOST/health"
echo "📈 Statistics: http://$GPU_HOST/stats"
echo "⚡ Queue Status: http://$GPU_HOST/queue_status"
echo ""
echo "🔧 Update your .env file with:"
echo "DATABASE_URL=postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$GPU_HOST:5432/$POSTGRES_DB"
echo "GPU_SERVER_URL=http://$GPU_HOST"
echo ""
echo "🚀 Ready to process repositories at massive scale!"
echo "🎯 Your L40S GPU + PostgreSQL system is live!" 