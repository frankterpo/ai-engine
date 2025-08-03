#!/usr/bin/env node

// Database-Cached AI-Enhanced RepoSimilarityScout
// Integrates with PostgreSQL + GPU server for maximum performance
const axios = require('axios');
const { Pool } = require('pg');
const crypto = require('crypto');
const { CohereClient } = require('cohere-ai');
const { HfInference } = require('@huggingface/inference');
require('dotenv').config();

// Database connection
let dbPool = null;

// Initialize database connection
async function initDatabase() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://repo_user:password@localhost:5432/repo_cache';
  
  try {
    dbPool = new Pool({
      connectionString: dbUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Test connection
    const client = await dbPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    console.log('✅ Database connection established');
    return true;
  } catch (error) {
    console.log(`❌ Database connection failed: ${error.message}`);
    dbPool = null;
    return false;
  }
}

// Base GitHub Client with database caching
class DatabaseCachedGitHubClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        'Authorization': `token ${apiKey}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'RepoSimilarityScout/2.0'
      }
    });
    
    // GPU server configuration
    this.gpuServerUrl = process.env.GPU_SERVER_URL || 'http://204.52.24.36:8000';
    
    // Cache for this session
    this.sessionCache = new Map();
  }

  async getRepositoryDetails(owner, repo) {
    const fullName = `${owner}/${repo}`;
    
    try {
      // 1. Check database cache first
      const cachedRepo = await this.getCachedRepository(fullName);
      if (cachedRepo) {
        console.log(`[CACHE] Repository ${fullName} found in database`);
        return cachedRepo;
      }

      // 2. Fetch from GitHub API
      console.log(`[API] Fetching ${fullName} from GitHub...`);
      const [repoData, readmeData, dependencyData] = await Promise.allSettled([
        this.fetchGitHubRepository(owner, repo),
        this.getReadmeContent(owner, repo),
        this.getDependencies(owner, repo)
      ]);

      const repository = repoData.status === 'fulfilled' ? repoData.value : {};
      const readme = readmeData.status === 'fulfilled' ? readmeData.value : null;
      const dependencies = dependencyData.status === 'fulfilled' ? dependencyData.value : [];

      const enrichedRepo = {
        ...repository,
        readme_content: readme,
        dependencies: dependencies,
        full_name: fullName,
        owner: { login: owner },
        name: repo,
        language: repository.language,
        topics: repository.topics || [],
        stars: repository.stargazers_count || 0,
        forks: repository.forks_count || 0,
        description: repository.description,
        updated_at: repository.updated_at,
        html_url: `https://github.com/${fullName}`
      };

      // 3. Save to database cache
      await this.saveRepositoryToDatabase(enrichedRepo);

      // 4. Queue for AI analysis if not already processed
      await this.queueForAIAnalysis(enrichedRepo);

      return enrichedRepo;

    } catch (error) {
      throw new Error(`Failed to get repository details for ${fullName}: ${error.message}`);
    }
  }

  async fetchGitHubRepository(owner, repo) {
    const response = await this.client.get(`/repos/${owner}/${repo}`);
    return response.data;
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

  // Database caching methods
  async getCachedRepository(fullName) {
    if (!dbPool) return null;

    try {
      const client = await dbPool.connect();
      const result = await client.query(
        `SELECT r.*, 
                COALESCE(e.embedding, NULL) as embedding,
                c.primary_category, c.confidence as classification_confidence,
                s.sentiment_label, s.confidence as sentiment_confidence
         FROM repositories r
         LEFT JOIN embeddings e ON r.id = e.repository_id AND e.model_name = 'all-MiniLM-L6-v2'
         LEFT JOIN classifications c ON r.id = c.repository_id
         LEFT JOIN sentiment_analysis s ON r.id = s.repository_id
         WHERE r.full_name = $1`,
        [fullName]
      );
      client.release();

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        full_name: row.full_name,
        owner: { login: row.owner },
        name: row.name,
        description: row.description,
        language: row.language,
        topics: row.topics || [],
        stars: row.stars,
        forks: row.forks,
        created_at: row.created_at,
        updated_at: row.updated_at,
        api_data: row.api_data,
        readme_content: row.readme_content,
        dependencies: await this.getCachedDependencies(row.id),
        // AI analysis results
        ai_analysis: {
          semantic_embedding: row.embedding,
          classification: row.primary_category ? {
            primary_category: row.primary_category,
            confidence: row.classification_confidence
          } : null,
          sentiment: row.sentiment_label ? {
            label: row.sentiment_label,
            confidence: row.sentiment_confidence
          } : null,
          ai_enhanced: !!(row.embedding || row.primary_category || row.sentiment_label),
          cached: true
        }
      };
    } catch (error) {
      console.log(`[DB ERROR] Failed to get cached repository: ${error.message}`);
      return null;
    }
  }

  async getCachedDependencies(repoId) {
    if (!dbPool) return [];

    try {
      const client = await dbPool.connect();
      const result = await client.query(
        'SELECT dependency_name FROM dependencies WHERE repository_id = $1',
        [repoId]
      );
      client.release();

      return result.rows.map(row => row.dependency_name);
    } catch (error) {
      return [];
    }
  }

  async saveRepositoryToDatabase(repoData) {
    if (!dbPool) return null;

    try {
      const client = await dbPool.connect();
      
      // Upsert repository
      const result = await client.query(`
        INSERT INTO repositories (
          full_name, owner, name, description, language, topics,
          stars, forks, created_at, updated_at, api_data, readme_content
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (full_name) 
        DO UPDATE SET
          description = EXCLUDED.description,
          language = EXCLUDED.language,
          topics = EXCLUDED.topics,
          stars = EXCLUDED.stars,
          forks = EXCLUDED.forks,
          updated_at = EXCLUDED.updated_at,
          api_data = EXCLUDED.api_data,
          readme_content = EXCLUDED.readme_content,
          fetched_at = CURRENT_TIMESTAMP
        RETURNING id
      `, [
        repoData.full_name,
        repoData.owner?.login || repoData.owner,
        repoData.name,
        repoData.description,
        repoData.language,
        repoData.topics || [],
        repoData.stars || repoData.stargazers_count || 0,
        repoData.forks || repoData.forks_count || 0,
        repoData.created_at,
        repoData.updated_at,
        JSON.stringify(repoData),
        repoData.readme_content
      ]);

      const repoId = result.rows[0].id;

      // Save dependencies
      if (repoData.dependencies && repoData.dependencies.length > 0) {
        for (const dep of repoData.dependencies) {
          await client.query(`
            INSERT INTO dependencies (repository_id, dependency_name, package_manager)
            VALUES ($1, $2, $3)
            ON CONFLICT (repository_id, dependency_name, dependency_type) DO NOTHING
          `, [repoId, dep, 'unknown']);
        }
      }

      client.release();
      console.log(`[DB] Saved repository ${repoData.full_name} to database`);
      return repoId;

    } catch (error) {
      console.log(`[DB ERROR] Failed to save repository: ${error.message}`);
      return null;
    }
  }

  async queueForAIAnalysis(repoData) {
    if (!dbPool) return;

    try {
      const client = await dbPool.connect();
      
      // Check if AI analysis already exists
      const existingAnalysis = await client.query(`
        SELECT r.id,
               CASE WHEN e.id IS NOT NULL THEN TRUE ELSE FALSE END as has_embedding,
               CASE WHEN c.id IS NOT NULL THEN TRUE ELSE FALSE END as has_classification,
               CASE WHEN s.id IS NOT NULL THEN TRUE ELSE FALSE END as has_sentiment
        FROM repositories r
        LEFT JOIN embeddings e ON r.id = e.repository_id
        LEFT JOIN classifications c ON r.id = c.repository_id
        LEFT JOIN sentiment_analysis s ON r.id = s.repository_id
        WHERE r.full_name = $1
      `, [repoData.full_name]);

      if (existingAnalysis.rows.length > 0) {
        const analysis = existingAnalysis.rows[0];
        const repoId = analysis.id;

        // Queue missing analysis tasks
        if (!analysis.has_embedding) {
          await client.query(`
            INSERT INTO processing_queue (repository_id, task_type, priority)
            VALUES ($1, 'embedding', 7)
            ON CONFLICT (repository_id, task_type) DO NOTHING
          `, [repoId]);
        }

        if (!analysis.has_classification) {
          await client.query(`
            INSERT INTO processing_queue (repository_id, task_type, priority)
            VALUES ($1, 'classification', 5)
            ON CONFLICT (repository_id, task_type) DO NOTHING
          `, [repoId]);
        }

        if (!analysis.has_sentiment) {
          await client.query(`
            INSERT INTO processing_queue (repository_id, task_type, priority)
            VALUES ($1, 'sentiment', 3)
            ON CONFLICT (repository_id, task_type) DO NOTHING
          `, [repoId]);
        }
      }

      client.release();
    } catch (error) {
      console.log(`[DB ERROR] Failed to queue for AI analysis: ${error.message}`);
    }
  }

  // Enhanced similarity search with database caching
  async searchSimilarRepositories(repoData, limit = 50) {
    console.log(`[DB-SEARCH] Starting database-cached similarity search for ${repoData.full_name}...`);

    // 1. Check for cached search results
    const cachedResults = await this.getCachedSearchResults(repoData, limit);
    if (cachedResults) {
      console.log(`[CACHE] Found cached search results for ${repoData.full_name}`);
      return cachedResults.results;
    }

    // 2. Perform semantic similarity search if we have embeddings
    let semanticResults = [];
    if (repoData.ai_analysis?.semantic_embedding) {
      semanticResults = await this.findSimilarByEmbedding(repoData.ai_analysis.semantic_embedding, limit);
    }

    // 3. Perform traditional search strategies as fallback
    let traditionalResults = [];
    if (semanticResults.length < limit) {
      traditionalResults = await this.performTraditionalSearch(repoData, limit - semanticResults.length);
    }

    // 4. Combine and rank results
    const combinedResults = this.combineAndRankResults(semanticResults, traditionalResults, repoData);
    const finalResults = combinedResults.slice(0, limit);

    // 5. Cache the results
    await this.cacheSearchResults(repoData, finalResults, limit);

    console.log(`[DB-SEARCH] Found ${finalResults.length} similar repositories`);
    return finalResults;
  }

  async findSimilarByEmbedding(targetEmbedding, limit = 20) {
    if (!dbPool) return [];

    try {
      const client = await dbPool.connect();
      
      // Use pgvector for semantic similarity search
      const result = await client.query(`
        SELECT r.full_name, r.name, r.description, r.language, r.topics, 
               r.stars, r.forks, r.updated_at,
               1 - (e.embedding <=> $1::vector) as similarity_score
        FROM repositories r
        JOIN embeddings e ON r.id = e.repository_id
        WHERE e.model_name = 'all-MiniLM-L6-v2'
        ORDER BY e.embedding <=> $1::vector
        LIMIT $2
      `, [JSON.stringify(targetEmbedding), limit]);

      client.release();

      return result.rows.map(row => ({
        name: row.name,
        full_name: row.full_name,
        url: `https://github.com/${row.full_name}`,
        stars: row.stars,
        description: row.description,
        language: row.language,
        topics: row.topics || [],
        forks: row.forks,
        updated: row.updated_at,
        strategy: 'Semantic Vector Search',
        score: 10,
        semantic_similarity: row.similarity_score,
        relevanceScore: row.similarity_score * 20,
        finalScore: 10 + (row.similarity_score * 20),
        ai_enhanced: true
      }));

    } catch (error) {
      console.log(`[DB ERROR] Semantic search failed: ${error.message}`);
      return [];
    }
  }

  async performTraditionalSearch(repoData, limit) {
    // Implement traditional GitHub search as fallback
    const strategies = [
      this.buildLanguageTopicsQuery(repoData),
      this.buildSemanticQuery(repoData),
      this.buildActivityQuery(repoData)
    ];

    const allResults = new Map();

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      if (!strategy.query) continue;

      try {
        const results = await this.searchRepositories(strategy.query, Math.ceil(limit / strategies.length));
        
        results.forEach(repo => {
          if (allResults.has(repo.full_name)) {
            const existing = allResults.get(repo.full_name);
            existing.strategies.push(strategy.name);
            existing.score += strategy.score;
          } else {
            allResults.set(repo.full_name, {
              name: repo.name,
              full_name: repo.full_name,
              url: repo.html_url,
              stars: repo.stargazers_count,
              description: repo.description,
              language: repo.language,
              topics: repo.topics || [],
              forks: repo.forks_count,
              updated: repo.updated_at,
              strategy: strategy.name,
              strategies: [strategy.name],
              score: strategy.score,
              relevanceScore: this.calculateRelevanceScore(repo, repoData),
              finalScore: strategy.score + this.calculateRelevanceScore(repo, repoData),
              ai_enhanced: false
            });
          }
        });

      } catch (error) {
        console.log(`[SEARCH ERROR] Strategy failed: ${error.message}`);
      }
    }

    return Array.from(allResults.values()).sort((a, b) => b.finalScore - a.finalScore);
  }

  buildLanguageTopicsQuery(repoData) {
    const language = repoData.language || '';
    const topics = (repoData.topics || []).slice(0, 3);
    let query = '';
    
    if (language) query += `language:${language} `;
    topics.forEach(topic => query += `topic:${topic} `);
    query += 'stars:>10';
    
    return { name: 'Language+Topics', query: query.trim(), score: 5 };
  }

  buildSemanticQuery(repoData) {
    const description = repoData.description || '';
    const words = description.toLowerCase().split(' ')
      .filter(word => word.length > 3 && !['the', 'and', 'for', 'with'].includes(word))
      .slice(0, 3);
    
    return { name: 'Semantic', query: words.join(' ') + ' stars:>5', score: 4 };
  }

  buildActivityQuery(repoData) {
    const language = repoData.language || '';
    let query = 'stars:>5000 size:>5000 ';
    if (language) query += `language:${language}`;
    
    return { name: 'Activity', query: query, score: 3 };
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
      console.log(`[API ERROR] Search failed for query "${query}": ${error.message}`);
      return [];
    }
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
    const starRatio = Math.min(repo.stars || repo.stargazers_count || 0, originalRepo.stars || 0) / 
                     Math.max(repo.stars || repo.stargazers_count || 1, originalRepo.stars || 1);
    score += starRatio * 5;
    
    return score;
  }

  combineAndRankResults(semanticResults, traditionalResults, originalRepo) {
    const allResults = new Map();

    // Add semantic results with higher weight
    semanticResults.forEach(repo => {
      allResults.set(repo.full_name, {
        ...repo,
        ai_enhanced: true,
        semantic_boost: 10
      });
    });

    // Add traditional results
    traditionalResults.forEach(repo => {
      if (allResults.has(repo.full_name)) {
        const existing = allResults.get(repo.full_name);
        existing.strategies = [...(existing.strategies || []), ...(repo.strategies || [])];
        existing.traditional_score = repo.finalScore;
        existing.finalScore = (existing.finalScore || 0) + (repo.finalScore || 0) * 0.5;
      } else {
        allResults.set(repo.full_name, {
          ...repo,
          ai_enhanced: false
        });
      }
    });

    return Array.from(allResults.values())
      .filter(repo => repo.full_name !== originalRepo.full_name)
      .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
  }

  // Search results caching
  async getCachedSearchResults(repoData, limit) {
    if (!dbPool) return null;

    try {
      const searchHash = this.generateSearchHash(repoData.full_name, limit);
      
      const client = await dbPool.connect();
      const result = await client.query(`
        SELECT results, created_at, expires_at
        FROM search_results_cache 
        WHERE search_query_hash = $1 AND expires_at > NOW()
      `, [searchHash]);
      client.release();

      if (result.rows.length > 0) {
        // Update access statistics
        await this.updateCacheAccess(searchHash);
        return result.rows[0];
      }

      return null;
    } catch (error) {
      console.log(`[CACHE ERROR] Failed to get cached results: ${error.message}`);
      return null;
    }
  }

  async cacheSearchResults(repoData, results, limit) {
    if (!dbPool) return;

    try {
      const searchHash = this.generateSearchHash(repoData.full_name, limit);
      
      const client = await dbPool.connect();
      await client.query(`
        INSERT INTO search_results_cache (
          search_query_hash, target_repo_id, search_parameters, 
          results, result_count, strategies_used
        ) VALUES (
          $1, 
          (SELECT id FROM repositories WHERE full_name = $2), 
          $3, $4, $5, $6
        )
        ON CONFLICT (search_query_hash) 
        DO UPDATE SET 
          results = EXCLUDED.results,
          result_count = EXCLUDED.result_count,
          created_at = CURRENT_TIMESTAMP,
          expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days'
      `, [
        searchHash,
        repoData.full_name,
        JSON.stringify({ full_name: repoData.full_name, limit }),
        JSON.stringify(results),
        results.length,
        results.map(r => r.strategy).filter((v, i, a) => a.indexOf(v) === i)
      ]);
      client.release();

    } catch (error) {
      console.log(`[CACHE ERROR] Failed to cache results: ${error.message}`);
    }
  }

  async updateCacheAccess(searchHash) {
    if (!dbPool) return;

    try {
      const client = await dbPool.connect();
      await client.query(`
        UPDATE search_results_cache 
        SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
        WHERE search_query_hash = $1
      `, [searchHash]);
      client.release();
    } catch (error) {
      // Ignore errors for analytics
    }
  }

  generateSearchHash(fullName, limit) {
    return crypto.createHash('sha256')
      .update(`${fullName}:${limit}`)
      .digest('hex');
  }
}

// Test the database-cached version
async function testDatabaseCached() {
  console.log('\n🗃️  Database-Cached Repository Analysis Starting...\n');
  
  const dbConnected = await initDatabase();
  if (!dbConnected) {
    console.log('⚠️  Database not available, falling back to basic functionality');
  }
  
  const client = new DatabaseCachedGitHubClient(process.env.GITHUB_TOKEN);
  
  const testRepo = 'facebook/react';
  const [owner, repo] = testRepo.split('/');
  
  try {
    console.log(`🔍 Database-Cached Analysis: ${testRepo}`);
    
    const repoData = await client.getRepositoryDetails(owner, repo);
    console.log(`📊 Repository: ${repoData.language}, ${repoData.topics?.length || 0} topics`);
    console.log(`🗃️  Cached: ${repoData.ai_analysis?.cached ? 'Yes' : 'No'}`);
    console.log(`🤖 AI Enhanced: ${repoData.ai_analysis?.ai_enhanced ? 'Yes' : 'No'}`);
    
    const similarRepos = await client.searchSimilarRepositories(repoData, 10);
    
    console.log(`\n✨ Found ${similarRepos.length} similar repositories:`);
    similarRepos.slice(0, 5).forEach((repo, i) => {
      const aiInfo = repo.ai_enhanced ? ' [🤖 AI]' : '';
      const semanticInfo = repo.semantic_similarity ? ` (${(repo.semantic_similarity * 100).toFixed(1)}% match)` : '';
      console.log(`${i + 1}. ${repo.full_name} (⭐${repo.stars}) Score: ${repo.finalScore?.toFixed(1)}${aiInfo}${semanticInfo}`);
    });
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

if (require.main === module) {
  testDatabaseCached();
}

module.exports = { DatabaseCachedGitHubClient, initDatabase }; 