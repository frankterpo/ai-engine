#!/usr/bin/env node

// Batch Repository Population Script
// Populates PostgreSQL database with thousands of repositories for caching
const axios = require('axios');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://repo_user:password@localhost:5432/repo_cache';
const GPU_SERVER_URL = process.env.GPU_SERVER_URL || 'http://204.52.24.36:8000';

const BATCH_SIZE = 100;
const LANGUAGES = [
  'JavaScript', 'Python', 'TypeScript', 'Java', 'Go', 'Rust', 'C++', 'C#', 
  'PHP', 'Ruby', 'Swift', 'Kotlin', 'Dart', 'Scala', 'Clojure', 'Elixir'
];

const TOPICS = [
  'machine-learning', 'web-development', 'mobile', 'api', 'framework', 'library',
  'data-science', 'devops', 'blockchain', 'ai', 'frontend', 'backend', 'fullstack',
  'microservices', 'docker', 'kubernetes', 'react', 'vue', 'angular', 'node',
  'django', 'flask', 'spring', 'express', 'next', 'svelte', 'react-native'
];

// Database connection
let dbPool = null;

// GitHub API client
const githubClient = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'RepoSimilarityScout-BatchProcessor/2.0'
  }
});

// GPU server client
const gpuClient = axios.create({
  baseURL: GPU_SERVER_URL,
  timeout: 30000
});

// Initialize database
async function initDatabase() {
  try {
    dbPool = new Pool({
      connectionString: DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    const client = await dbPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    console.log('✅ Database connection established');
    return true;
  } catch (error) {
    console.error(`❌ Database connection failed: ${error.message}`);
    return false;
  }
}

// Get trending repositories for a language/topic
async function getTrendingRepositories(language, topic = null, page = 1) {
  try {
    let query = `language:${language} stars:>50 pushed:>2023-01-01`;
    if (topic) {
      query += ` topic:${topic}`;
    }
    
    const response = await githubClient.get('/search/repositories', {
      params: {
        q: query,
        sort: 'stars',
        order: 'desc',
        per_page: 100,
        page: page
      }
    });
    
    return response.data.items;
  } catch (error) {
    console.log(`⚠️  Failed to fetch trending repositories: ${error.message}`);
    return [];
  }
}

// Get repository details with README and dependencies
async function getRepositoryDetails(repo) {
  try {
    const [readmeData, dependencyData] = await Promise.allSettled([
      getReadmeContent(repo.owner.login, repo.name),
      getDependencies(repo.owner.login, repo.name)
    ]);

    const readme = readmeData.status === 'fulfilled' ? readmeData.value : null;
    const dependencies = dependencyData.status === 'fulfilled' ? dependencyData.value : [];

    return {
      ...repo,
      readme_content: readme,
      dependencies: dependencies
    };
  } catch (error) {
    console.log(`⚠️  Failed to get details for ${repo.full_name}: ${error.message}`);
    return repo;
  }
}

// Get README content
async function getReadmeContent(owner, repo) {
  try {
    const response = await githubClient.get(`/repos/${owner}/${repo}/readme`);
    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return content.substring(0, 3000); // Limit content length
  } catch (error) {
    return null;
  }
}

// Get dependencies
async function getDependencies(owner, repo) {
  const dependencies = [];
  const files = ['package.json', 'requirements.txt', 'Gemfile', 'go.mod', 'pom.xml', 'Cargo.toml'];
  
  for (const file of files) {
    try {
      const response = await githubClient.get(`/repos/${owner}/${repo}/contents/${file}`);
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      
      if (file === 'package.json') {
        const packageData = JSON.parse(content);
        const deps = { ...packageData.dependencies, ...packageData.devDependencies };
        dependencies.push(...Object.keys(deps).slice(0, 50));
      } else if (file === 'requirements.txt') {
        const lines = content.split('\n').slice(0, 50);
        dependencies.push(...lines.filter(line => line.trim() && !line.startsWith('#')));
      } else if (file === 'Gemfile') {
        const lines = content.split('\n').filter(line => line.includes('gem '));
        dependencies.push(...lines.map(line => line.match(/'([^']+)'/)?.[1]).filter(Boolean).slice(0, 50));
      }
    } catch (error) {
      // File doesn't exist, continue
    }
  }
  
  return dependencies;
}

// Save repository to database
async function saveRepositoryToDatabase(repoData) {
  if (!dbPool) return null;

  try {
    const client = await dbPool.connect();
    
    // Upsert repository
    const result = await client.query(`
      INSERT INTO repositories (
        full_name, owner, name, description, language, topics,
        stars, forks, size_kb, created_at, updated_at, pushed_at,
        homepage, license, is_fork, is_archived, is_private,
        has_issues, has_projects, has_wiki, has_pages,
        open_issues_count, watchers_count, subscribers_count,
        api_data, readme_content
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
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
      repoData.owner.login,
      repoData.name,
      repoData.description,
      repoData.language,
      repoData.topics || [],
      repoData.stargazers_count || 0,
      repoData.forks_count || 0,
      repoData.size || 0,
      repoData.created_at,
      repoData.updated_at,
      repoData.pushed_at,
      repoData.homepage,
      repoData.license?.key,
      repoData.fork || false,
      repoData.archived || false,
      repoData.private || false,
      repoData.has_issues !== false,
      repoData.has_projects !== false,
      repoData.has_wiki !== false,
      repoData.has_pages || false,
      repoData.open_issues_count || 0,
      repoData.watchers_count || 0,
      repoData.subscribers_count || 0,
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
        `, [repoId, dep, detectPackageManager(repoData.language)]);
      }
    }

    // Add to AI processing queue
    await client.query(`
      INSERT INTO processing_queue (repository_id, task_type, priority)
      VALUES ($1, 'embedding', 5)
      ON CONFLICT (repository_id, task_type) DO NOTHING
    `, [repoId]);

    await client.query(`
      INSERT INTO processing_queue (repository_id, task_type, priority)
      VALUES ($1, 'classification', 3)
      ON CONFLICT (repository_id, task_type) DO NOTHING
    `, [repoId]);

    client.release();
    return repoId;

  } catch (error) {
    console.log(`❌ Failed to save repository ${repoData.full_name}: ${error.message}`);
    return null;
  }
}

// Detect package manager from language
function detectPackageManager(language) {
  const managers = {
    'JavaScript': 'npm',
    'TypeScript': 'npm',
    'Python': 'pip',
    'Ruby': 'gem',
    'Go': 'go',
    'Java': 'maven',
    'Rust': 'cargo',
    'PHP': 'composer',
    'C#': 'nuget'
  };
  return managers[language] || 'unknown';
}

// Batch process repositories
async function batchProcessRepositories(repositories) {
  console.log(`📦 Processing batch of ${repositories.length} repositories...`);
  
  const processedRepos = [];
  const failed = [];

  // Process repositories in smaller chunks to avoid overwhelming the API
  for (let i = 0; i < repositories.length; i += 10) {
    const chunk = repositories.slice(i, i + 10);
    
    const chunkPromises = chunk.map(async (repo) => {
      try {
        const detailedRepo = await getRepositoryDetails(repo);
        const repoId = await saveRepositoryToDatabase(detailedRepo);
        
        if (repoId) {
          processedRepos.push({ id: repoId, full_name: detailedRepo.full_name });
          console.log(`✅ Processed: ${detailedRepo.full_name}`);
        } else {
          failed.push(repo.full_name);
        }
      } catch (error) {
        console.log(`❌ Failed to process ${repo.full_name}: ${error.message}`);
        failed.push(repo.full_name);
      }
    });

    await Promise.allSettled(chunkPromises);
    
    // Rate limiting: wait between chunks
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`📊 Batch complete: ${processedRepos.length} processed, ${failed.length} failed`);
  return { processed: processedRepos, failed };
}

// Main population function
async function populateDatabase() {
  console.log('🚀 Starting massive repository population...');
  console.log(`📊 Target: Populate database with trending repositories from ${LANGUAGES.length} languages`);
  console.log(`🎯 Batch size: ${BATCH_SIZE} repositories per batch`);
  console.log('');

  // Initialize database
  const dbConnected = await initDatabase();
  if (!dbConnected) {
    console.error('❌ Cannot connect to database. Please check your DATABASE_URL.');
    process.exit(1);
  }

  let totalProcessed = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  // Create results directory
  const resultsDir = 'database_population_results';
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir);
  }

  console.log('🔍 Fetching trending repositories...\n');

  // Process each language
  for (const language of LANGUAGES) {
    console.log(`\n🎯 Processing ${language} repositories...`);
    
    try {
      // Get repositories for this language
      const repositories = [];
      
      // Fetch multiple pages and topics
      for (let page = 1; page <= 3; page++) {
        const repos = await getTrendingRepositories(language, null, page);
        repositories.push(...repos);
        
        if (repos.length < 100) break; // No more pages
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Also fetch with popular topics
      for (const topic of TOPICS.slice(0, 3)) {
        const repos = await getTrendingRepositories(language, topic);
        repositories.push(...repos);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Remove duplicates
      const uniqueRepos = repositories.filter((repo, index, self) => 
        index === self.findIndex(r => r.full_name === repo.full_name)
      );

      console.log(`📊 Found ${uniqueRepos.length} unique ${language} repositories`);

      if (uniqueRepos.length === 0) continue;

      // Process in batches
      for (let i = 0; i < uniqueRepos.length; i += BATCH_SIZE) {
        const batch = uniqueRepos.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(uniqueRepos.length / BATCH_SIZE);
        
        console.log(`\n📦 ${language} Batch ${batchNumber}/${totalBatches} (${batch.length} repos)`);
        
        const result = await batchProcessRepositories(batch);
        totalProcessed += result.processed.length;
        totalFailed += result.failed.length;

        // Save batch results
        const batchResults = {
          language,
          batchNumber,
          timestamp: new Date().toISOString(),
          processed: result.processed,
          failed: result.failed,
          stats: {
            processed_count: result.processed.length,
            failed_count: result.failed.length,
            success_rate: ((result.processed.length / batch.length) * 100).toFixed(1) + '%'
          }
        };

        fs.writeFileSync(
          path.join(resultsDir, `${language.toLowerCase()}_batch_${batchNumber}.json`),
          JSON.stringify(batchResults, null, 2)
        );

        console.log(`💾 Batch results saved to ${language.toLowerCase()}_batch_${batchNumber}.json`);
        
        // Rate limiting between batches
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error(`❌ Error processing ${language}: ${error.message}`);
      continue;
    }
  }

  const duration = (Date.now() - startTime) / 1000 / 60; // minutes

  // Generate final summary
  const summary = {
    timestamp: new Date().toISOString(),
    duration_minutes: Math.round(duration),
    total_processed: totalProcessed,
    total_failed: totalFailed,
    success_rate: ((totalProcessed / (totalProcessed + totalFailed)) * 100).toFixed(1) + '%',
    languages_processed: LANGUAGES.length,
    avg_repos_per_language: Math.round(totalProcessed / LANGUAGES.length),
    batch_size: BATCH_SIZE
  };

  fs.writeFileSync(
    path.join(resultsDir, 'population_summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log('\n🎉 ===============================================');
  console.log('🗃️  DATABASE POPULATION COMPLETE!');
  console.log('🎉 ===============================================');
  console.log('');
  console.log(`📊 Total Processed: ${totalProcessed} repositories`);
  console.log(`❌ Total Failed: ${totalFailed} repositories`);
  console.log(`✅ Success Rate: ${summary.success_rate}`);
  console.log(`⏱️  Duration: ${Math.round(duration)} minutes`);
  console.log(`🔗 Average: ${Math.round(totalProcessed / duration)} repos/minute`);
  console.log('');
  console.log('🚀 Your database is now loaded with trending repositories!');
  console.log('🎯 GPU server will process AI analysis in the background');
  console.log(`💾 Results saved in: ${resultsDir}/`);

  // Check GPU processing queue
  try {
    const queueStatus = await gpuClient.get('/queue_status');
    console.log('\n🤖 GPU Processing Queue Status:');
    console.log(`📋 Pending tasks: ${queueStatus.data.pending_tasks}`);
    console.log(`⚡ Processing tasks: ${queueStatus.data.processing_tasks}`);
    console.log(`✅ Completed today: ${queueStatus.data.completed_today}`);
    console.log(`🎯 GPU utilization: ${queueStatus.data.gpu_utilization.toFixed(1)}%`);
  } catch (error) {
    console.log('⚠️  Could not get GPU server status (this is OK if GPU server is not running)');
  }

  console.log('\n🎉 Ready for lightning-fast repository similarity searches!');
}

// Progress tracking
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Population interrupted by user');
  console.log('📊 Progress has been saved to database');
  console.log('🔄 You can resume by running this script again');
  process.exit(0);
});

if (require.main === module) {
  populateDatabase().catch(console.error);
}

module.exports = { populateDatabase, batchProcessRepositories }; 