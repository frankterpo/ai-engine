#!/usr/bin/env node

// 🚀 Simple AI-Powered Repository Analysis API
// For fast deployment and UI integration

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { FastAIClient } = require('./fast-ai-client.js');
require('dotenv').config();
const path = require('path'); // Added for serving static files

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim(); // Remove any whitespace
const fastAI = new FastAIClient();

// Validate GitHub token
if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN environment variable is not set');
} else {
    console.log('✅ GitHub token loaded:', GITHUB_TOKEN.substring(0, 12) + '...');
    console.log('✅ Token length:', GITHUB_TOKEN.length);
}

// GitHub API client
const githubClient = axios.create({
    baseURL: 'https://api.github.com',
    headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'RepoSimilarityScout',
        'Accept': 'application/vnd.github.v3+json'
    },
    timeout: 10000
});

// Debug the authorization header
console.log('🔍 Authorization header:', `token ${GITHUB_TOKEN?.substring(0, 12)}...`);

// Helper to extract owner/repo from URL
function parseRepoUrl(repoUrl) {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) throw new Error('Invalid GitHub URL');
    return { owner: match[1], repo: match[2] };
}

// POST /analyze endpoint with enhanced progress tracking
app.post('/analyze', async (req, res) => {
    const startTime = Date.now();
    console.log(`📊 [API] New analysis request started at ${new Date().toISOString()}`);
    
    try {
        const { repoUrl } = req.body;
        
        if (!repoUrl) {
            return res.status(400).json({
                success: false,
                error: 'Repository URL is required',
                message: 'Please provide a valid GitHub repository URL'
            });
        }
        
        // Validate GitHub URL format
        if (!repoUrl.includes('github.com')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid GitHub URL',
                message: 'Please provide a valid GitHub repository URL (e.g., https://github.com/owner/repo)'
            });
        }
        
        // Extract owner and repo from URL
        const { owner, repo } = parseRepoUrl(repoUrl);
        console.log(`🔍 [API] Analyzing: ${owner}/${repo}`);
        
        // Step 1: Get repository information
        console.log(`📡 [API] Fetching repository data...`);
        const repoResponse = await githubClient.get(`/repos/${owner}/${repo}`);
        const repoData = repoResponse.data;
        
        // Step 2: Get contributors
        console.log(`👥 [API] Fetching contributors...`);
        const contributorsResponse = await githubClient.get(`/repos/${owner}/${repo}/contributors`, {
            params: { per_page: 10 }
        });
        const contributors = contributorsResponse.data;
        
        // Step 3: Get owner's other repositories
        console.log(`🏢 [API] Fetching organization repositories...`);
        const ownerReposResponse = await githubClient.get(`/users/${owner}/repos`, {
            params: { 
                per_page: 20,
                sort: 'stars',
                direction: 'desc'
            }
        });
        const ownerRepos = ownerReposResponse.data;
        
        // Step 4: Enhanced AI Analysis with Real-time Progress
        console.log(`🤖 [API] Starting enhanced AI analysis with progress tracking...`);
        
        const repoAnalysisData = {
            name: repoData.name,
            full_name: repoData.full_name,
            description: repoData.description,
            language: repoData.language,
            topics: repoData.topics || [],
            stars: repoData.stargazers_count,
            owner: owner
        };
        
        // Progress tracking for real-time updates
        const progressUpdates = [];
        const onProgress = (update) => {
            progressUpdates.push({
                ...update,
                timestamp: Date.now()
            });
            console.log(`📊 [PROGRESS] ${update.step}: ${update.message}`);
        };
        
        // AI-powered company classification
        const companyType = await fastAI.classifyCompany(
            `${repoData.description} ${repoData.language} ${repoData.topics?.join(' ')}`
        );
        
        // Enhanced dynamic company discovery with progress tracking
        console.log(`🔍 [API] Discovering similar companies with AI...`);
        const discoveredSimilarCompanies = await fastAI.discoverSimilarCompanies(
            repoAnalysisData, 
            githubClient,
            onProgress
        );
        
        // Enhanced contributor analysis across similar repositories
        console.log(`👥 [API] Analyzing high-throughput contributors...`);
        const similarRepoData = discoveredSimilarCompanies.slice(0, 3).map(company => ({
            owner: company.name,
            name: company.sample_repo.name,
            language: company.sample_repo.language,
            full_name: `${company.name}/${company.sample_repo.name}`
        }));
        
        const crossRepoContributors = await fastAI.analyzeSimilarContributors(
            repoAnalysisData,
            similarRepoData,
            githubClient,
            onProgress
        );
        
        onProgress({ 
            step: 'finalizing', 
            message: 'Finalizing analysis results...', 
            progress: 98 
        });
        
        // Enhanced company profile with AI insights
        const enhancedCompanyProfile = {
            name: owner,
            type: companyType,
            description: `${owner} is a ${companyType.toLowerCase()} organization with ${ownerRepos.length} repositories. Primary languages: ${Array.from(new Set(ownerRepos.map(r => r.language).filter(Boolean))).slice(0, 5).join(', ')}. Total ${ownerRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0)} stars across projects.`,
            tech_stack: Array.from(new Set(ownerRepos.map(r => r.language).filter(Boolean))).slice(0, 8),
            total_repositories: ownerRepos.length,
            total_stars: ownerRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0),
            top_repositories: ownerRepos.slice(0, 5).map(repo => ({
                name: repo.name,
                description: repo.description,
                language: repo.language,
                stars: repo.stargazers_count
            })),
            ai_classification: companyType,
            discovery_method: 'Enhanced AI Analysis'
        };
        
        // Build comprehensive response with progress tracking
        const response = {
            success: true,
            analyzed_repository: {
                name: repoData.name,
                full_name: repoData.full_name,
                description: repoData.description,
                language: repoData.language,
                topics: repoData.topics || [],
                stars: repoData.stargazers_count,
                forks: repoData.forks_count,
                url: repoData.html_url
            },
            company_profile: enhancedCompanyProfile,
            discovered_similar_companies: discoveredSimilarCompanies.map(company => ({
                name: company.name,
                avatar: company.avatar,
                type: company.type,
                similarity_score: company.similarity_score,
                sample_repository: company.sample_repo,
                reasoning: company.reasoning,
                detailed_reasoning: company.detailed_reasoning,
                confidence_score: company.confidence_score,
                discovery_method: 'AI-Powered GitHub Search'
            })),
            cross_repo_contributors: crossRepoContributors.map(contributor => ({
                username: contributor.username,
                avatar: contributor.avatar,
                profile: contributor.profile,
                throughput_score: contributor.throughput_score,
                activity_level: contributor.activity_level,
                specialization: contributor.specialization,
                assessment: contributor.assessment,
                repositories_contributed: contributor.repos_contributed,
                total_contributions: contributor.total_contributions,
                metrics: contributor.metrics
            })),
            top_contributors: contributors.slice(0, 5).map(c => ({
                username: c.login,
                contributions: c.contributions,
                avatar: c.avatar_url,
                profile: c.html_url
            })),
            progress_log: progressUpdates,
            metadata: {
                processing_time_ms: Date.now() - startTime,
                ai_powered: true,
                analysis_date: new Date().toISOString(),
                discovery_methods: ['Enhanced AI Classification', 'Semantic Search', 'GitHub API', 'Cross-Repository Analysis', 'Throughput Assessment'],
                total_companies_discovered: discoveredSimilarCompanies.length,
                cross_repo_contributors_analyzed: crossRepoContributors.length,
                progress_steps: progressUpdates.length
            }
        };
        
        console.log(`✅ [API] Enhanced analysis completed in ${Date.now() - startTime}ms with ${progressUpdates.length} progress updates`);
        res.json(response);
        
    } catch (error) {
        console.error(`❌ [API] Error:`, error.message);
        console.error(`❌ [API] Error details:`, {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: error.response?.headers
        });
        
        const errorMessage = error.response?.status === 401 
            ? 'GitHub authentication failed - invalid token'
            : error.response?.status === 404
            ? 'Repository not found'
            : error.response?.status === 403
            ? 'GitHub API rate limit exceeded'
            : error.message;
            
        res.status(500).json({
            success: false,
            error: errorMessage,
            status_code: error.response?.status,
            message: 'Failed to analyze repository'
        });
    }
});

// Health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'AI Repository Analysis API',
        version: '2.0.0',
        ai_enabled: true,
        enhanced_features: [
            'Dynamic Company Discovery',
            'Cross-Repository Contributor Analysis', 
            'AI-Powered Throughput Assessment',
            'Semantic Similarity Matching'
        ],
        endpoints: [
            'POST /analyze - Enhanced repository analysis with AI-powered discovery',
            'GET /health - Service status and capabilities'
        ]
    });
});

// Root endpoint - serve HTML UI for browsers, JSON for API clients
app.get('/', (req, res) => {
    // Check if request accepts HTML (from browser)
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        // Return JSON for API clients
        res.json({
            service: '🚀 AI Repository Analysis API v2.0',
            description: 'Enhanced AI-powered repository analysis with dynamic company discovery and contributor assessment',
            features: [
                'Dynamic similar company discovery via AI',
                'Cross-repository contributor analysis',
                'AI-powered throughput scoring',
                'Semantic similarity matching',
                'Real-time GitHub search integration'
            ],
            usage: {
                endpoint: 'POST /analyze',
                body: {
                    repoUrl: 'https://github.com/facebook/react'
                }
            },
            example: `curl -X POST ${req.protocol}://${req.get('host')}/analyze -H "Content-Type: application/json" -d '{"repoUrl": "https://github.com/facebook/react"}'`,
            health: `${req.protocol}://${req.get('host')}/health`
        });
    }
});

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.log(`🎉 ===============================================`);
        console.log(`🚀 AI REPOSITORY ANALYSIS API v2.0 READY!`);
        console.log(`🎉 ===============================================`);
        console.log(`📡 Server: http://localhost:${port}`);
        console.log(`🔍 Analyze: POST http://localhost:${port}/analyze`);
        console.log(`❤️  Health: GET http://localhost:${port}/health`);
        console.log(`🤖 Enhanced AI Features:`);
        console.log(`   • Dynamic Company Discovery: ✅`);
        console.log(`   • Cross-Repository Analysis: ✅`);
        console.log(`   • AI Throughput Assessment: ✅`);
        console.log(`   • HuggingFace Classification: ✅`);
        console.log(`   • Semantic Similarity: ✅`);
        console.log(`📝 Example:`);
        console.log(`curl -X POST http://localhost:${port}/analyze \\`);
        console.log(`  -H "Content-Type: application/json" \\`);
        console.log(`  -d '{"repoUrl": "https://github.com/facebook/react"}'`);
        console.log(`🚀 READY FOR ENHANCED AI ANALYSIS!`);
    });
}

module.exports = app;