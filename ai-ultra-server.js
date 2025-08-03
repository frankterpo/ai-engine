#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const { AIEnhancedGitHubClient } = require('./ai-enhanced-scout.js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Check for AI API keys
const hasAIKeys = process.env.COHERE_API_KEY && process.env.HUGGINGFACE_API_KEY;

// Initialize AI-enhanced GitHub client
let githubClient;
try {
  githubClient = new AIEnhancedGitHubClient(process.env.GITHUB_TOKEN);
  console.log('✅ AI-Enhanced GitHub client initialized');
} catch (error) {
  console.error('❌ Failed to initialize AI-Enhanced client:', error.message);
  process.exit(1);
}

// Helper function to extract owner/repo from GitHub URL
function extractOwnerRepo(repoUrl) {
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
  if (!match) {
    throw new Error('Invalid GitHub repository URL');
  }
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

// AI-Enhanced Scout endpoint
app.post('/scout', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { repoUrl, limit = 10 } = req.body;
    
    if (!repoUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'Repository URL is required' 
      });
    }

    console.log(`🤖 [AI-SCOUT] Starting AI-enhanced analysis: ${repoUrl} (limit: ${limit})`);
    
    const { owner, repo } = extractOwnerRepo(repoUrl);
    
    // Get detailed repository information with AI analysis
    const repoData = await githubClient.getRepositoryDetails(owner, repo);
    console.log(`📊 [AI-SCOUT] Repository analyzed: ${repoData.language}, ${repoData.topics?.length || 0} topics, AI-Enhanced: ${repoData.ai_analysis?.ai_enhanced}`);
    
    // Log AI insights
    if (repoData.ai_analysis) {
      if (repoData.ai_analysis.classification) {
        console.log(`🤖 [AI-SCOUT] Classification: ${repoData.ai_analysis.classification.primary_category} (${(repoData.ai_analysis.classification.confidence * 100).toFixed(1)}%)`);
      }
      if (repoData.ai_analysis.sentiment) {
        console.log(`💭 [AI-SCOUT] Sentiment: ${repoData.ai_analysis.sentiment.label} (${(repoData.ai_analysis.sentiment.confidence * 100).toFixed(1)}%)`);
      }
      if (repoData.ai_analysis.code_patterns) {
        console.log(`🏗️  [AI-SCOUT] Architecture: ${repoData.ai_analysis.code_patterns.architecture_patterns?.join(', ') || 'None detected'}`);
        console.log(`📈 [AI-SCOUT] Innovation Score: ${repoData.ai_analysis.code_patterns.innovation_score}/10`);
      }
    }
    
    // Find similar repositories using AI-enhanced search
    const similarRepos = await githubClient.searchSimilarRepositories(repoData, limit);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [AI-SCOUT] Completed in ${duration}ms: ${similarRepos.length} AI-enhanced repositories`);
    console.log(`🤖 [AI-SCOUT] AI-enhanced results: ${similarRepos.filter(r => r.ai_enhanced).length}`);
    
    // Enhanced response with AI metadata
    const response = {
      success: true,
      originalRepo: {
        owner: owner,
        name: repo,
        full_name: `${owner}/${repo}`,
        url: `https://github.com/${owner}/${repo}`,
        language: repoData.language,
        topics: repoData.topics || [],
        stars: repoData.stars || repoData.stargazers_count,
        forks: repoData.forks || repoData.forks_count,
        description: repoData.description,
        ai_analysis: repoData.ai_analysis
      },
      similarRepos: similarRepos.map(repo => ({
        name: repo.name,
        full_name: repo.full_name,
        url: repo.url,
        stars: repo.stars,
        description: repo.description,
        language: repo.language,
        topics: repo.topics || [],
        forks: repo.forks,
        updated: repo.updated || repo.updated_at,
        strategy: repo.strategy,
        score: repo.score,
        strategies: repo.strategies || [repo.strategy],
        relevanceScore: repo.relevanceScore,
        finalScore: repo.finalScore,
        // AI enhancements
        ai_enhanced: repo.ai_enhanced || false,
        semantic_similarity: repo.semantic_similarity,
        ai_boost: repo.ai_boost,
        base_score: repo.base_score,
        ai_match_reason: repo.ai_match_reason
      })),
      searchStrategies: [
        "Language + Topics", "Dependencies Analysis", "Semantic Keywords", 
        "Activity Similarity", "Architecture Patterns", "Domain Discovery", 
        "Tech Stack Ecosystem", "Community Patterns", "Recent Trends", 
        "Name Similarity", "License Compatibility", "Scale Similarity",
        "AI Semantic Search", "AI Classification", "AI Code Analysis"
      ],
      metadata: {
        totalFound: similarRepos.length,
        searchDuration: duration,
        version: "ai-enhanced-v1.0",
        aiEnhanced: hasAIKeys,
        aiResults: similarRepos.filter(r => r.ai_enhanced).length,
        averageRelevanceScore: similarRepos.length > 0 ? 
          (similarRepos.reduce((sum, repo) => sum + (repo.finalScore || repo.score || 0), 0) / similarRepos.length).toFixed(2) : "0",
        aiCapabilities: {
          semantic_embeddings: !!process.env.COHERE_API_KEY,
          text_classification: !!process.env.HUGGINGFACE_API_KEY,
          sentiment_analysis: !!process.env.HUGGINGFACE_API_KEY,
          code_pattern_analysis: true
        }
      }
    };

    res.json(response);

  } catch (error) {
    console.error(`❌ [AI-SCOUT] Error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: 'ai-enhanced-v1.0',
    aiCapabilities: {
      cohere: !!process.env.COHERE_API_KEY,
      huggingface: !!process.env.HUGGINGFACE_API_KEY,
      github: !!process.env.GITHUB_TOKEN
    }
  });
});

// Demo endpoint
app.get('/demo', async (req, res) => {
  try {
    const demoRepos = [
      'https://github.com/microsoft/vscode',
      'https://github.com/facebook/react',
      'https://github.com/vercel/next.js'
    ];
    
    const results = {};
    
    for (const repoUrl of demoRepos) {
      try {
        const { owner, repo } = extractOwnerRepo(repoUrl);
        const repoData = await githubClient.getRepositoryDetails(owner, repo);
        const similarRepos = await githubClient.searchSimilarRepositories(repoData, 5);
        
        results[repo] = {
          original: {
            name: repoData.full_name,
            language: repoData.language,
            stars: repoData.stargazers_count,
            ai_classification: repoData.ai_analysis?.classification?.primary_category,
            ai_confidence: repoData.ai_analysis?.classification ? 
              (repoData.ai_analysis.classification.confidence * 100).toFixed(1) + '%' : null
          },
          similar: similarRepos.slice(0, 3).map(repo => ({
            name: repo.full_name,
            stars: repo.stars,
            ai_enhanced: repo.ai_enhanced,
            semantic_match: repo.semantic_similarity ? 
              (repo.semantic_similarity * 100).toFixed(1) + '%' : null
          }))
        };
      } catch (error) {
        results[repo.split('/')[1]] = { error: error.message };
      }
    }
    
    res.json({
      demo: 'AI-Enhanced RepoSimilarityScout',
      results,
      aiPowered: hasAIKeys
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log('\n🎉 ===============================================');
  console.log('🤖 AI-ENHANCED REPOSIMILARITYSCOUT READY!');
  console.log('🎉 ===============================================\n');
  
  console.log(`📡 Server: http://localhost:${port}`);
  console.log(`🔍 AI Scout API: POST http://localhost:${port}/scout`);
  console.log(`❤️  Health: GET http://localhost:${port}/health`);
  console.log(`🎯 Demo: GET http://localhost:${port}/demo`);
  
  console.log('\n🤖 AI CAPABILITIES:');
  console.log(`   • Cohere Embeddings: ${!!process.env.COHERE_API_KEY ? '✅ Ready' : '❌ Missing API Key'}`);
  console.log(`   • Hugging Face AI: ${!!process.env.HUGGINGFACE_API_KEY ? '✅ Ready' : '❌ Missing API Key'}`);
  console.log(`   • Semantic Search: ${hasAIKeys ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   • Code Classification: ${hasAIKeys ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   • Sentiment Analysis: ${!!process.env.HUGGINGFACE_API_KEY ? '✅ Ready' : '❌ Missing API Key'}`);
  console.log(`   • Pattern Detection: ✅ Active`);
  
  if (!hasAIKeys) {
    console.log('\n⚠️  WARNING: AI features disabled - missing API keys!');
    console.log('Add these to your .env file:');
    console.log('COHERE_API_KEY=your_cohere_key');
    console.log('HUGGINGFACE_API_KEY=your_huggingface_key');
  }
  
  console.log('\n✨ ENHANCED FEATURES:');
  console.log('   • 15+ AI-powered search strategies');
  console.log('   • Semantic similarity matching');
  console.log('   • Intelligent code classification');
  console.log('   • Architecture pattern detection');
  console.log('   • Innovation scoring');
  console.log('   • Sentiment analysis');
  console.log('   • Real-time caching for speed');
  
  console.log('\n🎯 EXAMPLE USAGE:');
  console.log('curl -X POST http://localhost:4000/scout \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"repoUrl": "https://github.com/facebook/react", "limit": 15}\'');
  
  console.log('\n🚀 READY TO DOMINATE WITH AI! 🤖\n');
}); 