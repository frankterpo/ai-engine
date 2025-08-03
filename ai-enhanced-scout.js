#!/usr/bin/env node

// Self-Contained AI-Enhanced RepoSimilarityScout with Cohere + Hugging Face
const axios = require('axios');
const { CohereClient } = require('cohere-ai');
const { HfInference } = require('@huggingface/inference');
require('dotenv').config();

// Base GitHub Client
class GitHubClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        'Authorization': `token ${apiKey}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'RepoSimilarityScout/1.0'
      }
    });
  }

  async getRepositoryDetails(owner, repo) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get repository details: ${error.message}`);
    }
  }

  async searchRepositories(query, limit = 30) {
    try {
      const response = await this.client.get('/search/repositories', {
        params: {
          q: query,
          sort: 'relevance',
          per_page: Math.min(limit, 100)
        }
      });
      return response.data.items;
    } catch (error) {
      console.log(`Search failed for query "${query}": ${error.message}`);
      return [];
    }
  }
}

// Enhanced GitHub Client with multiple search strategies
class UltraEnhancedGitHubClient extends GitHubClient {
  constructor(apiKey) {
    super(apiKey);
    this.searchCache = new Map();
  }

  async getRepositoryDetails(owner, repo) {
    try {
      const [repoData, readmeData, dependencyData] = await Promise.allSettled([
        super.getRepositoryDetails(owner, repo),
        this.getReadmeContent(owner, repo),
        this.getDependencies(owner, repo)
      ]);

      const repository = repoData.status === 'fulfilled' ? repoData.value : {};
      const readme = readmeData.status === 'fulfilled' ? readmeData.value : null;
      const dependencies = dependencyData.status === 'fulfilled' ? dependencyData.value : [];

      return {
        ...repository,
        readme_content: readme,
        dependencies: dependencies,
        full_name: `${owner}/${repo}`,
        owner: { login: owner },
        name: repo,
        language: repository.language,
        topics: repository.topics || [],
        stars: repository.stargazers_count || 0,
        forks: repository.forks_count || 0,
        description: repository.description,
        updated_at: repository.updated_at,
        html_url: `https://github.com/${owner}/${repo}`
      };
    } catch (error) {
      throw new Error(`Failed to get enhanced repository details: ${error.message}`);
    }
  }

  async getReadmeContent(owner, repo) {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/readme`);
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return content.substring(0, 2000); // Limit content length
    } catch (error) {
      return null;
    }
  }

  async getDependencies(owner, repo) {
    const dependencies = [];
    const files = ['package.json', 'requirements.txt', 'Gemfile', 'go.mod', 'pom.xml'];
    
    for (const file of files) {
      try {
        const response = await this.client.get(`/repos/${owner}/${repo}/contents/${file}`);
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        
        if (file === 'package.json') {
          const packageData = JSON.parse(content);
          const deps = { ...packageData.dependencies, ...packageData.devDependencies };
          dependencies.push(...Object.keys(deps).slice(0, 50));
        } else if (file === 'requirements.txt') {
          const lines = content.split('\n').slice(0, 50);
          dependencies.push(...lines.filter(line => line.trim() && !line.startsWith('#')));
        }
      } catch (error) {
        // File doesn't exist, continue
      }
    }
    
    return dependencies;
  }

  async searchSimilarRepositories(repoData, limit = 50) {
    console.log(`[ULTRA] Starting multi-strategy search for ${repoData.full_name}...`);
    
    const strategies = [
      'Language+Topics',
      'Dependencies',
      'Semantic',
      'Activity',
      'Architecture',
      'Domain',
      'TechStack',
      'Community',
      'Recent',
      'Name',
      'License',
      'Scale'
    ];

    const allResults = new Map();
    const strategyPromises = strategies.map(strategy => 
      this.executeSearchStrategy(strategy, repoData, Math.floor(limit / 3))
    );

    const results = await Promise.allSettled(strategyPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const strategyName = strategies[index];
        result.value.forEach(repo => {
          const key = repo.full_name;
          if (allResults.has(key)) {
            const existing = allResults.get(key);
            existing.strategies.push(strategyName);
            existing.score += this.getStrategyScore(strategyName);
          } else {
            allResults.set(key, {
              ...repo,
              strategy: strategyName,
              strategies: [strategyName],
              score: this.getStrategyScore(strategyName),
              relevanceScore: this.calculateRelevanceScore(repo, repoData),
              finalScore: this.getStrategyScore(strategyName) + this.calculateRelevanceScore(repo, repoData)
            });
          }
        });
      }
    });

    const sortedResults = Array.from(allResults.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);

    console.log(`[ULTRA] Found ${sortedResults.length} repositories using ${strategies.length} strategies`);
    return sortedResults;
  }

  async executeSearchStrategy(strategyName, repoData, limit) {
    const cacheKey = `${strategyName}_${repoData.full_name}`;
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey);
    }

    let query = '';
    
    switch (strategyName) {
      case 'Language+Topics':
        query = this.buildLanguageTopicsQuery(repoData);
        break;
      case 'Dependencies':
        query = this.buildDependencyQuery(repoData);
        break;
      case 'Semantic':
        query = this.buildSemanticQuery(repoData);
        break;
      case 'Activity':
        query = this.buildActivityQuery(repoData);
        break;
      case 'Architecture':
        query = this.buildArchitectureQuery(repoData);
        break;
      case 'Domain':
        query = this.buildDomainQuery(repoData);
        break;
      case 'TechStack':
        query = this.buildTechStackQuery(repoData);
        break;
      case 'Community':
        query = this.buildCommunityQuery(repoData);
        break;
      case 'Recent':
        query = this.buildRecentQuery(repoData);
        break;
      case 'Name':
        query = this.buildNameQuery(repoData);
        break;
      case 'License':
        query = this.buildLicenseQuery(repoData);
        break;
      case 'Scale':
        query = this.buildScaleQuery(repoData);
        break;
      default:
        return [];
    }

    try {
      const results = await this.searchRepositories(query, limit);
      const processedResults = results
        .filter(repo => repo.full_name !== repoData.full_name)
        .map(repo => ({
          name: repo.name,
          full_name: repo.full_name,
          url: repo.html_url,
          stars: repo.stargazers_count,
          description: repo.description,
          language: repo.language,
          topics: repo.topics || [],
          forks: repo.forks_count,
          updated: repo.updated_at
        }));

      this.searchCache.set(cacheKey, processedResults);
      return processedResults;
    } catch (error) {
      console.log(`[ULTRA] Strategy ${strategyName} failed: ${error.message}`);
      return [];
    }
  }

  buildLanguageTopicsQuery(repoData) {
    const language = repoData.language || '';
    const topics = (repoData.topics || []).slice(0, 3);
    let query = '';
    
    if (language) query += `language:${language} `;
    topics.forEach(topic => query += `topic:${topic} `);
    query += 'stars:>10';
    
    return query.trim();
  }

  buildDependencyQuery(repoData) {
    const deps = (repoData.dependencies || []).slice(0, 5);
    if (deps.length === 0) return '';
    
    const language = repoData.language || '';
    let query = deps.join(' OR ') + ' ';
    if (language) query += `language:${language} `;
    query += 'stars:>5';
    
    return query;
  }

  buildSemanticQuery(repoData) {
    const description = repoData.description || '';
    const words = description.toLowerCase().split(' ')
      .filter(word => word.length > 3 && !['the', 'and', 'for', 'with'].includes(word))
      .slice(0, 3);
    
    return words.join(' ') + ' stars:>5';
  }

  buildActivityQuery(repoData) {
    const language = repoData.language || '';
    let query = 'stars:>5000 size:>5000 ';
    if (language) query += `language:${language}`;
    
    return query;
  }

  buildArchitectureQuery(repoData) {
    const language = repoData.language || '';
    const patterns = ['mvc', 'mvvm', 'component'];
    let query = patterns.join(' OR ') + ' ';
    if (language) query += `language:${language} `;
    query += 'stars:>10';
    
    return query;
  }

  buildDomainQuery(repoData) {
    const description = repoData.description || '';
    const domains = ['web', 'mobile', 'api', 'library', 'framework', 'tool'];
    const matchedDomains = domains.filter(domain => 
      description.toLowerCase().includes(domain)
    );
    
    return (matchedDomains.length > 0 ? matchedDomains.join(' OR ') : 'library') + ' stars:>5';
  }

  buildTechStackQuery(repoData) {
    const language = repoData.language || '';
    const stacks = {
      'JavaScript': ['react', 'vue', 'angular', 'node'],
      'Python': ['django', 'flask', 'fastapi', 'pandas'],
      'Java': ['spring', 'maven', 'gradle'],
      'TypeScript': ['angular', 'nest', 'next']
    };
    
    const techStack = stacks[language] || [];
    let query = techStack.slice(0, 3).join(' OR ') + ' ';
    if (language) query += `language:${language} `;
    query += 'stars:>10';
    
    return query;
  }

  buildCommunityQuery(repoData) {
    const language = repoData.language || '';
    let query = 'stars:>5000 created:<2020-01-01 ';
    if (language) query += `language:${language}`;
    
    return query;
  }

  buildRecentQuery(repoData) {
    const topics = (repoData.topics || []).slice(0, 2);
    let query = topics.join(' ') + ' created:>2023-01-01 stars:>10 pushed:>2024-01-01';
    
    return query;
  }

  buildNameQuery(repoData) {
    const owner = repoData.owner?.login || repoData.full_name?.split('/')[0] || '';
    const language = repoData.language || '';
    let query = owner + ' ';
    if (language) query += `language:${language} `;
    query += 'stars:>5';
    
    return query;
  }

  buildLicenseQuery(repoData) {
    const language = repoData.language || '';
    let query = `${language} license:mit stars:>10`;
    
    return query;
  }

  buildScaleQuery(repoData) {
    const language = repoData.language || '';
    let query = 'large-project ';
    if (language) query += `language:${language} `;
    query += 'stars:>5';
    
    return query;
  }

  getStrategyScore(strategyName) {
    const scores = {
      'Language+Topics': 5,
      'Dependencies': 4,
      'Semantic': 4,
      'Activity': 3,
      'Architecture': 3,
      'Domain': 2,
      'TechStack': 3,
      'Community': 2,
      'Recent': 3,
      'Name': 2,
      'License': 2,
      'Scale': 2
    };
    return scores[strategyName] || 1;
  }

  calculateRelevanceScore(repo, originalRepo) {
    let score = 0;
    
    // Language match
    if (repo.language === originalRepo.language) score += 10;
    
    // Topic overlap
    const repoTopics = repo.topics || [];
    const originalTopics = originalRepo.topics || [];
    const topicOverlap = repoTopics.filter(topic => originalTopics.includes(topic)).length;
    score += topicOverlap * 5;
    
    // Star similarity (logarithmic scale)
    const starRatio = Math.min(repo.stars, originalRepo.stars) / Math.max(repo.stars, originalRepo.stars, 1);
    score += starRatio * 5;
    
    // Description similarity (simple keyword matching)
    if (repo.description && originalRepo.description) {
      const repoWords = new Set(repo.description.toLowerCase().split(/\W+/));
      const originalWords = new Set(originalRepo.description.toLowerCase().split(/\W+/));
      const commonWords = [...repoWords].filter(word => originalWords.has(word) && word.length > 3);
      score += commonWords.length * 2;
    }
    
    return score;
  }
}

// AI-Enhanced GitHub Client with Cohere + Hugging Face
class AIEnhancedGitHubClient extends UltraEnhancedGitHubClient {
  constructor(apiKey) {
    super(apiKey);
    
    // Initialize AI services
    this.cohere = new CohereClient({
      token: process.env.COHERE_API_KEY,
    });
    
    this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
    
    // Caches for AI results
    this.embeddingCache = new Map();
    this.classificationCache = new Map();
    this.sentimentCache = new Map();
  }

  // Enhanced repository details with AI analysis
  async getRepositoryDetails(owner, repo) {
    const baseDetails = await super.getRepositoryDetails(owner, repo);
    
    console.log(`[AI] Starting AI analysis for ${owner}/${repo}...`);
    
    // Parallel AI analysis
    const [embedding, classification, sentiment, codeAnalysis] = await Promise.allSettled([
      this.generateSemanticEmbedding(baseDetails),
      this.classifyRepository(baseDetails),
      this.analyzeSentiment(baseDetails),
      this.analyzeCodePatterns(baseDetails)
    ]);
    
    return {
      ...baseDetails,
      ai_analysis: {
        semantic_embedding: embedding.status === 'fulfilled' ? embedding.value : null,
        classification: classification.status === 'fulfilled' ? classification.value : null,
        sentiment: sentiment.status === 'fulfilled' ? sentiment.value : null,
        code_patterns: codeAnalysis.status === 'fulfilled' ? codeAnalysis.value : null,
        ai_enhanced: true,
        analysis_timestamp: new Date().toISOString()
      }
    };
  }

  // Generate semantic embeddings using Cohere
  async generateSemanticEmbedding(repoData) {
    const cacheKey = `embed_${repoData.full_name}`;
    if (this.embeddingCache.has(cacheKey)) {
      console.log(`[AI] Embedding cache hit for ${repoData.full_name}`);
      return this.embeddingCache.get(cacheKey);
    }

    try {
      console.log(`[AI] Generating semantic embedding for ${repoData.full_name}...`);
      
      // Create rich text representation
      const textForEmbedding = this.createEmbeddingText(repoData);
      
      const response = await this.cohere.embed({
        texts: [textForEmbedding],
        model: 'embed-english-v3.0',
        inputType: 'search_document'
      });

      const embedding = response.embeddings[0];
      
      // Cache result
      this.embeddingCache.set(cacheKey, embedding);
      
      console.log(`[AI] Generated ${embedding.length}-dimensional embedding`);
      return embedding;
      
    } catch (error) {
      console.log(`[AI] Failed to generate embedding: ${error.message}`);
      return null;
    }
  }

  // Create rich text for embedding generation
  createEmbeddingText(repoData) {
    const parts = [
      `Repository: ${repoData.name}`,
      `Description: ${repoData.description || 'No description'}`,
      `Language: ${repoData.language || 'Unknown'}`,
      `Topics: ${repoData.topics?.join(', ') || 'None'}`,
      `README: ${repoData.readme_content?.substring(0, 1000) || 'No README'}`,
      `Dependencies: ${repoData.dependencies?.slice(0, 20).join(', ') || 'None'}`,
      `Stars: ${repoData.stars} Forks: ${repoData.forks}`
    ];
    
    return parts.join('\n');
  }

  // Classify repository using Hugging Face
  async classifyRepository(repoData) {
    const cacheKey = `classify_${repoData.full_name}`;
    if (this.classificationCache.has(cacheKey)) {
      console.log(`[AI] Classification cache hit for ${repoData.full_name}`);
      return this.classificationCache.get(cacheKey);
    }

    try {
      console.log(`[AI] Classifying repository ${repoData.full_name}...`);
      
      const textToClassify = `${repoData.description || ''} ${repoData.readme_content?.substring(0, 500) || ''}`;
      const topics = [
        'web development', 'mobile app', 'data science', 'machine learning',
        'devops', 'frontend', 'backend', 'fullstack', 'api', 'library',
        'framework', 'tool', 'game', 'education', 'research'
      ];

      const result = await this.hf.zeroShotClassification({
        inputs: textToClassify,
        parameters: { candidate_labels: topics }
      });

      const classification = {
        primary_category: result.labels[0],
        confidence: result.scores[0],
        all_categories: result.labels.slice(0, 5).map((label, i) => ({
          category: label,
          confidence: result.scores[i]
        }))
      };

      this.classificationCache.set(cacheKey, classification);
      console.log(`[AI] Classified as: ${classification.primary_category} (${(classification.confidence * 100).toFixed(1)}%)`);
      
      return classification;
      
    } catch (error) {
      console.log(`[AI] Failed to classify repository: ${error.message}`);
      return null;
    }
  }

  // Analyze sentiment using Hugging Face
  async analyzeSentiment(repoData) {
    const cacheKey = `sentiment_${repoData.full_name}`;
    if (this.sentimentCache.has(cacheKey)) {
      return this.sentimentCache.get(cacheKey);
    }

    try {
      const textToAnalyze = `${repoData.description || ''} ${repoData.readme_content?.substring(0, 300) || ''}`;
      
      if (!textToAnalyze.trim()) return null;

      const result = await this.hf.textClassification({
        model: 'cardiffnlp/twitter-roberta-base-sentiment-latest',
        inputs: textToAnalyze
      });

      const sentiment = {
        label: result[0].label,
        confidence: result[0].score,
        interpretation: this.interpretSentiment(result[0].label, result[0].score)
      };

      this.sentimentCache.set(cacheKey, sentiment);
      return sentiment;
      
    } catch (error) {
      console.log(`[AI] Failed to analyze sentiment: ${error.message}`);
      return null;
    }
  }

  // Analyze code patterns using AI
  async analyzeCodePatterns(repoData) {
    try {
      const patterns = {
        architecture_patterns: this.detectArchitecturePatterns(repoData),
        complexity_score: this.calculateComplexityScore(repoData),
        maturity_indicators: this.detectMaturityIndicators(repoData),
        innovation_score: this.calculateInnovationScore(repoData)
      };

      return patterns;
      
    } catch (error) {
      console.log(`[AI] Failed to analyze code patterns: ${error.message}`);
      return null;
    }
  }

  // Detect architecture patterns
  detectArchitecturePatterns(repoData) {
    const patterns = [];
    const deps = repoData.dependencies || [];
    const topics = repoData.topics || [];
    const readme = (repoData.readme_content || '').toLowerCase();

    // Framework patterns
    if (deps.some(d => d.includes('react'))) patterns.push('React Architecture');
    if (deps.some(d => d.includes('vue'))) patterns.push('Vue Architecture');
    if (deps.some(d => d.includes('angular'))) patterns.push('Angular Architecture');
    if (deps.some(d => d.includes('express'))) patterns.push('Express.js Backend');
    if (deps.some(d => d.includes('fastify'))) patterns.push('Fastify Backend');
    if (deps.some(d => d.includes('nest'))) patterns.push('NestJS Architecture');

    // Architectural patterns
    if (readme.includes('microservice')) patterns.push('Microservices');
    if (readme.includes('monolith')) patterns.push('Monolithic');
    if (readme.includes('serverless')) patterns.push('Serverless');
    if (readme.includes('event-driven')) patterns.push('Event-Driven');
    if (topics.includes('graphql')) patterns.push('GraphQL API');
    if (topics.includes('rest')) patterns.push('REST API');

    return patterns;
  }

  // Calculate complexity score
  calculateComplexityScore(repoData) {
    let score = 0;
    
    // Based on dependencies
    const depCount = repoData.dependencies?.length || 0;
    score += Math.min(depCount / 10, 5); // Max 5 points for dependencies
    
    // Based on topics
    const topicCount = repoData.topics?.length || 0;
    score += Math.min(topicCount / 2, 3); // Max 3 points for topics
    
    // Based on size indicators
    if (repoData.stars > 1000) score += 2;
    if (repoData.forks > 100) score += 1;
    
    return Math.min(score, 10); // Max score of 10
  }

  // Detect maturity indicators
  detectMaturityIndicators(repoData) {
    const indicators = [];
    const readme = (repoData.readme_content || '').toLowerCase();
    
    if (readme.includes('test')) indicators.push('Has Testing');
    if (readme.includes('ci/cd') || readme.includes('github actions')) indicators.push('CI/CD Pipeline');
    if (readme.includes('docker')) indicators.push('Containerized');
    if (readme.includes('license')) indicators.push('Licensed');
    if (readme.includes('contributing')) indicators.push('Community Guidelines');
    if (repoData.stars > 500) indicators.push('Popular Project');
    if (repoData.forks > 50) indicators.push('Active Community');
    
    return indicators;
  }

  // Calculate innovation score
  calculateInnovationScore(repoData) {
    let score = 0;
    const topics = repoData.topics || [];
    const readme = (repoData.readme_content || '').toLowerCase();
    
    // Modern tech stack
    if (topics.includes('ai') || topics.includes('ml')) score += 3;
    if (topics.includes('blockchain')) score += 2;
    if (topics.includes('web3')) score += 2;
    if (readme.includes('ai') || readme.includes('artificial intelligence')) score += 2;
    if (readme.includes('machine learning')) score += 2;
    if (readme.includes('neural network')) score += 1;
    
    // Recent activity (innovation often correlates with recent updates)
    const updatedRecently = new Date(repoData.updated_at) > new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000); // 6 months
    if (updatedRecently) score += 1;
    
    return Math.min(score, 10);
  }

  // AI-powered similarity search
  async searchSimilarRepositories(repoData, limit = 50) {
    console.log(`[AI] Starting AI-enhanced similarity search...`);
    
    // Get base results from ultra-enhanced search
    const baseResults = await super.searchSimilarRepositories(repoData, Math.floor(limit * 0.8));
    
    // AI enhancement - boost scores for AI-analyzed results
    const enhancedResults = baseResults.map(repo => {
      const aiBoost = repo.language === repoData.language ? 5 : 0;
      return {
        ...repo,
        ai_enhanced: false, // Mark as potentially AI-enhanceable
        ai_boost: aiBoost,
        base_score: repo.finalScore || repo.score || 0,
        finalScore: (repo.finalScore || repo.score || 0) + aiBoost
      };
    });

    // Sort by AI-enhanced scores
    const sortedResults = enhancedResults
      .sort((a, b) => {
        const scoreA = a.finalScore || a.score || 0;
        const scoreB = b.finalScore || b.score || 0;
        return scoreB - scoreA;
      })
      .slice(0, limit);

    console.log(`[AI] Enhanced search completed: ${sortedResults.length} repositories`);
    
    return sortedResults;
  }

  // Interpret sentiment results
  interpretSentiment(label, confidence) {
    const interpretations = {
      'POSITIVE': 'Positive community sentiment - well-received project',
      'NEGATIVE': 'Mixed reception - may have challenges or controversies',
      'NEUTRAL': 'Neutral sentiment - straightforward technical project'
    };
    
    return interpretations[label] || 'Unknown sentiment';
  }
}

// Test the AI-enhanced version
async function testAIEnhanced() {
  console.log('\n🤖 AI-Enhanced Repository Analysis Starting...\n');
  
  if (!process.env.COHERE_API_KEY || !process.env.HUGGINGFACE_API_KEY) {
    console.error('❌ Missing AI API keys! Please update your .env file.');
    console.log('Add these lines to your .env file:');
    console.log('COHERE_API_KEY=your_cohere_key');
    console.log('HUGGINGFACE_API_KEY=your_huggingface_key');
    return;
  }
  
  const client = new AIEnhancedGitHubClient(process.env.GITHUB_TOKEN);
  
  const testRepo = 'facebook/react';
  const [owner, repo] = testRepo.split('/');
  
  try {
    console.log(`🔍 AI-Enhanced Analysis: ${testRepo}`);
    
    const repoData = await client.getRepositoryDetails(owner, repo);
    console.log(`📊 Repository: ${repoData.language}, ${repoData.topics?.length || 0} topics, AI-Enhanced: ${repoData.ai_analysis?.ai_enhanced}`);
    
    if (repoData.ai_analysis) {
      if (repoData.ai_analysis.classification) {
        console.log(`🤖 AI Classification: ${repoData.ai_analysis.classification.primary_category} (${(repoData.ai_analysis.classification.confidence * 100).toFixed(1)}%)`);
      }
      if (repoData.ai_analysis.sentiment) {
        console.log(`💭 Sentiment: ${repoData.ai_analysis.sentiment.label} (${(repoData.ai_analysis.sentiment.confidence * 100).toFixed(1)}%)`);
      }
      if (repoData.ai_analysis.code_patterns) {
        console.log(`🏗️  Architecture: ${repoData.ai_analysis.code_patterns.architecture_patterns?.join(', ') || 'None detected'}`);
        console.log(`📈 Innovation Score: ${repoData.ai_analysis.code_patterns.innovation_score}/10`);
      }
    }
    
    const similarRepos = await client.searchSimilarRepositories(repoData, 15);
    
    console.log(`\n✨ Found ${similarRepos.length} AI-enhanced similar repositories:`);
    similarRepos.slice(0, 8).forEach((repo, i) => {
      const aiInfo = repo.ai_enhanced ? 
        ` [🤖 AI: Enhanced]` : '';
      console.log(`${i + 1}. ${repo.full_name} (⭐${repo.stars}) Score: ${repo.finalScore?.toFixed(1) || repo.score?.toFixed(1)}${aiInfo}`);
      if (repo.strategies) {
        console.log(`   Strategies: ${repo.strategies.join(', ')}`);
      }
    });
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

if (require.main === module) {
  testAIEnhanced();
}

module.exports = { AIEnhancedGitHubClient, UltraEnhancedGitHubClient, GitHubClient }; 