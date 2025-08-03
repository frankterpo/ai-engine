#!/usr/bin/env node

// Ultra-Enhanced RepoSimilarityScout with Contributor Analysis
const { UltraEnhancedGitHubClient } = require('./ai-enhanced-scout.js');

class ContributorEnhancedGitHubClient extends UltraEnhancedGitHubClient {
  constructor(apiKey) {
    super(apiKey);
    this.contributorCache = new Map();
  }

  // Enhanced repository details with contributor information
  async getRepositoryDetails(owner, repo) {
    const baseDetails = await super.getRepositoryDetails(owner, repo);
    
    // Add contributor analysis
    const contributors = await this.getRepositoryContributors(owner, repo);
    
    return {
      ...baseDetails,
      contributors: contributors,
      top_contributors: contributors.slice(0, 10), // Top 10 contributors
      contributor_count: contributors.length
    };
  }

  // Get repository contributors with contribution details
  async getRepositoryContributors(owner, repo) {
    const cacheKey = `${owner}/${repo}`;
    if (this.contributorCache.has(cacheKey)) {
      console.log(`[CONTRIBUTORS] Cache hit for ${cacheKey}`);
      return this.contributorCache.get(cacheKey);
    }

    try {
      console.log(`[CONTRIBUTORS] Fetching contributors for ${owner}/${repo}`);
      const response = await this.client.get(`/repos/${owner}/${repo}/contributors`, {
        params: {
          per_page: 30, // Top 30 contributors
          anon: false   // Only registered users
        }
      });

      const contributors = response.data.map(contributor => ({
        username: contributor.login,
        contributions: contributor.contributions,
        avatar_url: contributor.avatar_url,
        html_url: contributor.html_url,
        type: contributor.type,
        id: contributor.id
      }));

      // Cache for 1 hour (contributors don't change frequently)
      this.contributorCache.set(cacheKey, contributors);
      
      // Auto-cleanup cache if it gets too large
      if (this.contributorCache.size > 500) {
        const keysToDelete = Array.from(this.contributorCache.keys()).slice(0, 100);
        keysToDelete.forEach(key => this.contributorCache.delete(key));
      }

      return contributors;
      
    } catch (error) {
      console.log(`[CONTRIBUTORS] Failed to fetch contributors for ${owner}/${repo}: ${error.message}`);
      return [];
    }
  }

  // Get other repositories where these contributors have contributed
  async getContributorRepositories(contributors, originalRepo, limit = 20) {
    console.log(`[CONTRIBUTORS] Analyzing ${contributors.length} contributors for cross-repository activity`);
    
    const contributorRepos = new Map();
    const topContributors = contributors.slice(0, 5); // Focus on top 5 contributors
    
    for (const contributor of topContributors) {
      try {
        console.log(`[CONTRIBUTORS] Checking ${contributor.username}'s repositories...`);
        
        // Get user's public repositories
        const userReposResponse = await this.client.get(`/users/${contributor.username}/repos`, {
          params: {
            sort: 'updated',
            direction: 'desc',
            per_page: 30,
            type: 'public'
          }
        });

        // Filter and score repositories
        userReposResponse.data.forEach(repo => {
          if (repo.full_name !== originalRepo && 
              repo.stargazers_count > 5 && 
              !repo.fork &&
              repo.size > 100) { // Filter out very small repos
            
            const key = repo.full_name;
            if (!contributorRepos.has(key)) {
              contributorRepos.set(key, {
                name: repo.name,
                full_name: repo.full_name,
                url: repo.html_url,
                stars: repo.stargazers_count,
                description: repo.description,
                language: repo.language,
                topics: repo.topics || [],
                forks: repo.forks_count,
                updated: repo.updated_at,
                size: repo.size,
                contributors_overlap: [],
                contributor_score: 0,
                strategy: 'Contributor Analysis'
              });
            }
            
            const existingRepo = contributorRepos.get(key);
            existingRepo.contributors_overlap.push({
              username: contributor.username,
              contributions_to_original: contributor.contributions,
              is_owner: repo.owner.login === contributor.username
            });
            
            // Score based on contributor importance and relationship
            let contributorWeight = Math.log(contributor.contributions + 1) * 2;
            if (repo.owner.login === contributor.username) {
              contributorWeight *= 3; // Boost if they own the repo
            }
            existingRepo.contributor_score += contributorWeight;
          }
        });

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`[CONTRIBUTORS] Error fetching repos for ${contributor.username}: ${error.message}`);
      }
    }

    // Convert to array and sort by contributor score
    const results = Array.from(contributorRepos.values())
      .sort((a, b) => {
        // Multi-factor sorting: contributor score, then stars, then overlap count
        if (a.contributor_score !== b.contributor_score) {
          return b.contributor_score - a.contributor_score;
        }
        if (a.contributors_overlap.length !== b.contributors_overlap.length) {
          return b.contributors_overlap.length - a.contributors_overlap.length;
        }
        return b.stars - a.stars;
      })
      .slice(0, limit);

    console.log(`[CONTRIBUTORS] Found ${results.length} repositories with contributor overlap`);
    return results;
  }

  // Override the ultra search to include contributor analysis
  async searchSimilarRepositories(repoData, limit = 50) {
    console.log(`[ULTRA+CONTRIBUTORS] Starting enhanced search with contributor analysis`);
    
    // Get base results from ultra-enhanced search
    const baseResults = await super.searchSimilarRepositories(repoData, Math.floor(limit * 0.7));
    
    // Add contributor-based results
    let contributorResults = [];
    if (repoData.contributors && repoData.contributors.length > 0) {
      contributorResults = await this.getContributorRepositories(
        repoData.contributors, 
        repoData.full_name, 
        Math.floor(limit * 0.3)
      );
    }

    // Combine and deduplicate results
    const allResults = new Map();
    
    // Add base results (higher priority)
    baseResults.forEach(repo => {
      allResults.set(repo.full_name, {
        ...repo,
        score: (repo.score || 0) + 5, // Boost original strategy results
        has_contributor_overlap: false
      });
    });
    
    // Add contributor results
    contributorResults.forEach(repo => {
      const existing = allResults.get(repo.full_name);
      if (existing) {
        // Repository found in both searches - boost score significantly
        existing.score += repo.contributor_score + 10;
        existing.contributor_score = repo.contributor_score;
        existing.contributors_overlap = repo.contributors_overlap;
        existing.has_contributor_overlap = true;
        existing.strategy = existing.strategy + ' + ' + repo.strategy;
        if (existing.strategies) {
          existing.strategies.push('Contributor Analysis');
        }
      } else {
        // New repository from contributor analysis
        allResults.set(repo.full_name, {
          ...repo,
          score: repo.contributor_score,
          finalScore: repo.contributor_score,
          relevanceScore: repo.contributor_score,
          strategies: ['Contributor Analysis'],
          has_contributor_overlap: true
        });
      }
    });

    // Sort by enhanced scoring
    const sortedResults = Array.from(allResults.values())
      .sort((a, b) => {
        // Prioritize repos with contributor overlap
        if (a.has_contributor_overlap !== b.has_contributor_overlap) {
          return b.has_contributor_overlap - a.has_contributor_overlap;
        }
        // Then by final score
        const scoreA = a.finalScore || a.score || 0;
        const scoreB = b.finalScore || b.score || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        // Finally by stars
        return b.stars - a.stars;
      })
      .slice(0, limit);

    console.log(`[ULTRA+CONTRIBUTORS] Combined results: ${sortedResults.length} repositories`);
    console.log(`[ULTRA+CONTRIBUTORS] With contributor overlap: ${sortedResults.filter(r => r.has_contributor_overlap).length}`);
    
    return sortedResults;
  }

  // New method to analyze contributor overlap between two repositories
  async analyzeContributorOverlap(repo1, repo2) {
    try {
      const [owner1, name1] = repo1.split('/');
      const [owner2, name2] = repo2.split('/');
      
      const [contributors1, contributors2] = await Promise.all([
        this.getRepositoryContributors(owner1, name1),
        this.getRepositoryContributors(owner2, name2)
      ]);

      const usernames1 = new Set(contributors1.map(c => c.username));
      const usernames2 = new Set(contributors2.map(c => c.username));
      
      const overlap = contributors1.filter(c => usernames2.has(c.username));
      const overlapPercentage = (overlap.length / Math.min(contributors1.length, contributors2.length)) * 100;
      
      return {
        repo1: repo1,
        repo2: repo2,
        overlap_count: overlap.length,
        overlap_percentage: overlapPercentage.toFixed(1),
        shared_contributors: overlap.map(c => ({
          username: c.username,
          contributions_to_repo1: c.contributions,
          contributions_to_repo2: contributors2.find(c2 => c2.username === c.username)?.contributions || 0
        })),
        repo1_contributors: contributors1.length,
        repo2_contributors: contributors2.length
      };
      
    } catch (error) {
      console.error(`[CONTRIBUTORS] Error analyzing overlap: ${error.message}`);
      return null;
    }
  }
}

// Test the contributor-enhanced version
async function testContributorEnhanced() {
  const client = new ContributorEnhancedGitHubClient(process.env.GITHUB_TOKEN);
  
  const testRepo = 'microsoft/vscode';
  const [owner, repo] = testRepo.split('/');
  
  console.log(`\n🚀 Contributor-Enhanced Analysis: ${testRepo}`);
  
  try {
    const repoData = await client.getRepositoryDetails(owner, repo);
    console.log(`📊 Repository: ${repoData.language}, ${repoData.topics.length} topics, ${repoData.contributor_count} contributors`);
    console.log(`👥 Top contributors: ${repoData.top_contributors.slice(0, 3).map(c => c.username).join(', ')}`);
    
    const similarRepos = await client.searchSimilarRepositories(repoData, 15);
    
    console.log(`\n✨ Found ${similarRepos.length} ultra-similar repositories (with contributor analysis):`);
    similarRepos.slice(0, 8).forEach((repo, i) => {
      const contributorInfo = repo.has_contributor_overlap ? 
        ` [👥 ${repo.contributors_overlap?.length || 0} shared contributors]` : '';
      console.log(`${i + 1}. ${repo.full_name} (⭐${repo.stars}) Score: ${repo.finalScore?.toFixed(1) || repo.score?.toFixed(1)}${contributorInfo}`);
      if (repo.strategies) {
        console.log(`   Strategies: ${repo.strategies.join(', ')}`);
      }
    });
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

if (require.main === module) {
  testContributorEnhanced();
}

module.exports = { ContributorEnhancedGitHubClient }; 