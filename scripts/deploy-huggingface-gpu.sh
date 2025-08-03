#!/bin/bash

# 🤗 Hugging Face GPU Server Deployment Script
# Deploys company analysis server on L40S infrastructure

set -e  # Exit on any error

# Configuration
GPU_HOST="204.52.24.36"
SSH_KEY="./scripts/team23_private_key"
DEPLOY_USER="ubuntu"
SERVER_PORT="8000"

echo "🤗 Deploying Hugging Face GPU Server for Company Analysis..."
echo "=================================================="

# Validate SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "❌ SSH key not found: $SSH_KEY"
    echo "Please ensure the private key is in the scripts/ directory"
    exit 1
fi

# Set correct permissions
chmod 600 "$SSH_KEY"
echo "✅ SSH key permissions set"

# Test SSH connection
echo "🔍 Testing SSH connection..."
if ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$DEPLOY_USER@$GPU_HOST" "echo 'SSH connection successful'" > /dev/null 2>&1; then
    echo "✅ SSH connection successful"
else
    echo "❌ SSH connection failed"
    echo ""
    echo "🛠️  TROUBLESHOOTING OPTIONS:"
    echo "1. Check if the SSH key is correct"
    echo "2. Verify the GPU server is accessible"
    echo "3. Try manual connection: ssh -i $SSH_KEY $DEPLOY_USER@$GPU_HOST"
    exit 1
fi

# Copy files to GPU server
echo "📦 Copying server files..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
    "./scripts/huggingface-gpu-server.py" \
    "./scripts/requirements-huggingface.txt" \
    "$DEPLOY_USER@$GPU_HOST:/tmp/"

echo "✅ Files copied successfully"

# Deploy on GPU server
echo "🚀 Setting up Hugging Face GPU server..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$DEPLOY_USER@$GPU_HOST" << 'EOF'
set -e

echo "🔧 Installing system dependencies..."
sudo apt update
sudo apt install -y python3 python3-pip python3-venv htop nvtop

echo "🐍 Setting up Python environment..."
cd /tmp
python3 -m venv huggingface-env
source huggingface-env/bin/activate

echo "📦 Installing Python packages..."
pip install --upgrade pip
pip install -r requirements-huggingface.txt

# Install PyTorch with CUDA support for L40S
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

echo "🏠 Setting up application directory..."
sudo mkdir -p /opt/huggingface-server
sudo cp huggingface-gpu-server.py /opt/huggingface-server/
sudo cp -r huggingface-env /opt/huggingface-server/
sudo chown -R ubuntu:ubuntu /opt/huggingface-server

echo "🔄 Creating systemd service..."
sudo tee /etc/systemd/system/huggingface-server.service > /dev/null << 'SERVICE'
[Unit]
Description=Hugging Face GPU Company Analysis Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/huggingface-server
Environment=PATH=/opt/huggingface-server/huggingface-env/bin
ExecStart=/opt/huggingface-server/huggingface-env/bin/python huggingface-gpu-server.py
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

echo "🚀 Starting Hugging Face server..."
sudo systemctl daemon-reload
sudo systemctl enable huggingface-server
sudo systemctl start huggingface-server

echo "⏳ Waiting for server to start..."
sleep 10

echo "🔍 Checking server status..."
sudo systemctl status huggingface-server --no-pager || true

echo "📊 Server logs (last 20 lines):"
sudo journalctl -u huggingface-server -n 20 --no-pager || true

EOF

echo "✅ Deployment completed!"
echo ""
echo "🎯 HUGGING FACE GPU SERVER READY!"
echo "================================="
echo "🌐 Server URL: http://$GPU_HOST:$SERVER_PORT"
echo "❤️  Health Check: curl http://$GPU_HOST:$SERVER_PORT/health"
echo "🏢 Company Analysis: curl -X POST http://$GPU_HOST:$SERVER_PORT/analyze_company_profile"
echo "🔍 Similar Companies: curl -X POST http://$GPU_HOST:$SERVER_PORT/find_similar_companies"
echo ""
echo "🛠️  MANAGEMENT COMMANDS:"
echo "• Check status: ssh -i $SSH_KEY $DEPLOY_USER@$GPU_HOST 'sudo systemctl status huggingface-server'"
echo "• View logs: ssh -i $SSH_KEY $DEPLOY_USER@$GPU_HOST 'sudo journalctl -u huggingface-server -f'"
echo "• Restart: ssh -i $SSH_KEY $DEPLOY_USER@$GPU_HOST 'sudo systemctl restart huggingface-server'"
echo ""
echo "📝 UPDATE YOUR .env FILE:"
echo "GPU_SERVER_URL=http://$GPU_HOST:$SERVER_PORT"
echo ""
echo "🎉 Ready for company profile analysis with GPU acceleration!" 