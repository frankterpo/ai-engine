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

// Main API endpoint
app.post('/analyze', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { repoUrl } = req.body;
        if (!repoUrl) {
            return res.status(400).json({ error: 'repoUrl is required' });
        }

        console.log(`🚀 [API] Analyzing repository: ${repoUrl}`);
        
        // Step 1: Parse repo URL
        const { owner, repo } = parseRepoUrl(repoUrl);
        
        // Step 2: Get repository details
        console.log(`📋 [API] Fetching repository details...`);
        const repoResponse = await githubClient.get(`/repos/${owner}/${repo}`);
        const repoData = repoResponse.data;
        
        // Step 3: Get contributors
        console.log(`👥 [API] Fetching contributors...`);
        const contributorsResponse = await githubClient.get(`/repos/${owner}/${repo}/contributors`);
        const contributors = contributorsResponse.data.slice(0, 10); // Top 10 contributors
        
        // Step 4: Get company profile (owner's repos)
        console.log(`🏢 [API] Fetching company profile...`);
        const ownerReposResponse = await githubClient.get(`/users/${owner}/repos?sort=stars&per_page=20`);
        const ownerRepos = ownerReposResponse.data;
        
        // Step 5: AI Analysis
        console.log(`🤖 [API] Running AI analysis...`);
        
        // Create company description
        const techStack = [...new Set(ownerRepos.map(r => r.language).filter(Boolean))];
        const allTopics = [...new Set(ownerRepos.flatMap(r => r.topics || []))];
        const totalStars = ownerRepos.reduce((sum, r) => sum + r.stargazers_count, 0);
        
        const companyDescription = `${owner} is a technology company with ${ownerRepos.length} repositories. ` +
            `Primary languages: ${techStack.slice(0, 3).join(', ')}. ` +
            `Focus areas: ${allTopics.slice(0, 5).join(', ')}. ` +
            `Total ${totalStars} stars across projects.`;
        
        // AI Classification
        const companyType = await fastAI.classifyCompany(companyDescription);
        
        // Step 6: Find Similar Companies
        console.log(`🔍 [API] Finding similar companies...`);
        
        const targetCompany = {
            name: owner,
            description: companyDescription,
            tech_stack: techStack
        };
        
        const knownCompanies = [
            { name: 'vercel', description: 'Next.js creators, TypeScript and React focus, frontend deployment platform', tech_stack: ['TypeScript', 'React', 'NextJS'] },
            { name: 'facebook', description: 'React library creators, JavaScript frontend frameworks, social platform technology', tech_stack: ['JavaScript', 'React', 'PHP'] },
            { name: 'microsoft', description: 'TypeScript creators, Visual Studio Code, extensive developer tools and enterprise software', tech_stack: ['TypeScript', 'C#', 'Python'] },
            { name: 'google', description: 'Angular framework, Go language, extensive web technologies and cloud infrastructure', tech_stack: ['Go', 'TypeScript', 'Python'] },
            { name: 'airbnb', description: 'JavaScript style guides, React components, frontend development best practices', tech_stack: ['JavaScript', 'React', 'CSS'] },
            { name: 'openai', description: 'AI research and development, machine learning models, Python-based AI tools', tech_stack: ['Python', 'AI', 'ML'] },
            { name: 'huggingface', description: 'Machine learning models, transformers library, AI model sharing platform', tech_stack: ['Python', 'ML', 'AI'] },
            { name: 'hashicorp', description: 'Infrastructure automation, DevOps tools, Go-based system utilities', tech_stack: ['Go', 'DevOps', 'Infrastructure'] },
            { name: 'netlify', description: 'JAMstack deployment platform, serverless functions, modern web development', tech_stack: ['JavaScript', 'JAMstack', 'Serverless'] },
            { name: 'stripe', description: 'Payment processing APIs, fintech infrastructure, developer-first payment solutions', tech_stack: ['Ruby', 'JavaScript', 'Python'] }
        ];
        
        const similarCompanies = await fastAI.findSimilarCompanies(targetCompany, knownCompanies);
        
        // Step 7: Build response
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
            company_profile: {
                name: owner,
                type: companyType,
                description: companyDescription,
                tech_stack: techStack.slice(0, 5),
                total_repositories: ownerRepos.length,
                total_stars: totalStars,
                top_repositories: ownerRepos.slice(0, 5).map(r => ({
                    name: r.name,
                    description: r.description,
                    language: r.language,
                    stars: r.stargazers_count
                }))
            },
            similar_companies: similarCompanies.slice(0, 5).map(comp => ({
                name: comp.company,
                similarity_score: Math.round(comp.similarity * 100) / 100,
                reasoning: comp.reasoning
            })),
            top_contributors: contributors.slice(0, 5).map(c => ({
                username: c.login,
                contributions: c.contributions,
                avatar: c.avatar_url,
                profile: c.html_url
            })),
            metadata: {
                processing_time_ms: Date.now() - startTime,
                ai_powered: true,
                analysis_date: new Date().toISOString()
            }
        };
        
        console.log(`✅ [API] Analysis completed in ${Date.now() - startTime}ms`);
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
        version: '1.0.0',
        ai_enabled: true,
        endpoints: [
            'POST /analyze - Analyze repository and find similar companies'
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
            service: '🚀 AI Repository Analysis API',
            description: 'Analyze GitHub repositories and find similar companies using AI',
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

app.listen(port, () => {
    console.log(`🎉 ===============================================`);
    console.log(`🚀 AI REPOSITORY ANALYSIS API READY!`);
    console.log(`🎉 ===============================================`);
    console.log(`📡 Server: http://localhost:${port}`);
    console.log(`🔍 Analyze: POST http://localhost:${port}/analyze`);
    console.log(`❤️  Health: GET http://localhost:${port}/health`);
    console.log(`🤖 AI Features:`);
    console.log(`   • HuggingFace Classification: ✅`);
    console.log(`   • Semantic Similarity: ✅`);
    console.log(`   • Company Analysis: ✅`);
    console.log(`   • Contributor Analysis: ✅`);
    console.log(`📝 Example:`);
    console.log(`curl -X POST http://localhost:${port}/analyze \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"repoUrl": "https://github.com/facebook/react"}'`);
    console.log(`🚀 READY FOR UI INTEGRATION!`);
});

module.exports = app; 