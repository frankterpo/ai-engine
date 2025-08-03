#!/bin/bash

# 🚀 Deploy AI Repository Scout to Vercel
echo "🚀 DEPLOYING AI REPOSITORY SCOUT TO VERCEL"
echo "=========================================="

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "Installing Vercel CLI..."
    npm i -g vercel
fi

# Set environment variables
echo "Setting up environment variables..."
vercel env add GITHUB_TOKEN
vercel env add HUGGINGFACE_API_KEY

# Deploy to Vercel
echo "Deploying to Vercel..."
vercel --prod

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "🎯 YOUR AI REPOSITORY SCOUT IS LIVE!"
echo "=================================="
echo "• Beautiful UI for repository analysis"
echo "• AI-powered company classification" 
echo "• Similar companies with reasoning"
echo "• Top contributors analysis"
echo "• Fast semantic similarity search"
echo ""
echo "🔗 Access your deployed app at the URL above"
echo "📱 Mobile-friendly responsive design"
echo "🤖 Powered by HuggingFace AI models" 