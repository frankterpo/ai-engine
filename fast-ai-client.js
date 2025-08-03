#!/usr/bin/env node

// 🚀 Fast AI Client - Uses Existing HF Models (No Training Required)
// Ready in 5 minutes instead of 2 hours!

const { HfInference } = require('@huggingface/inference');  
const axios = require('axios');
require('dotenv').config();

class FastAIClient {
  constructor() {
    this.hfApiKey = process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_WRITE_KEY;
    this.hf = new HfInference(this.hfApiKey);
    
    // Create axios client for direct HF API calls
    this.hfClient = axios.create({
      baseURL: 'https://api-inference.huggingface.co',
      headers: {
        'Authorization': `Bearer ${this.hfApiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log(`🤖 FastAI initialized with HF key: ${this.hfApiKey ? this.hfApiKey.substring(0, 8) + '...' : 'MISSING'}`);
    
    // Pre-trained models - ready to use immediately
    this.models = {
      classifier: "microsoft/DialoGPT-medium", // For company type classification
      embeddings: "sentence-transformers/all-MiniLM-L6-v2", // Fast embeddings
      similarity: "microsoft/codebert-base" // Code similarity
    };
  }

  async classifyCompany(companyDescription) {
    console.log(`[AI] Classifying company with HuggingFace...`);
    
    try {
      // Method 1: Try HuggingFace inference client
      const result = await this.hf.zeroShotClassification({
        model: "facebook/bart-large-mnli",
        inputs: companyDescription,
        parameters: {
          candidate_labels: [
            "Web Development", 
            "AI/ML Company", 
            "Developer Tools", 
            "Backend/Infrastructure", 
            "Mobile Development",
            "Data Science",
            "Cloud Services",
            "Gaming"
          ]
        }
      });
      
      console.log(`[AI] HF Classification successful: ${result.labels[0]}`);
      return result.labels[0]; // Return the top classification
      
    } catch (error) {
      console.log(`[AI] HF Client failed, trying direct API: ${error.message}`);
      
      try {
        // Method 2: Direct API call
        const response = await this.hfClient.post('/models/facebook/bart-large-mnli', {
          inputs: companyDescription,
          parameters: {
            candidate_labels: ["Web Development", "AI/ML Company", "Developer Tools", "Backend/Infrastructure"]
          }
        });
        
        console.log(`[AI] Direct HF API successful: ${response.data.labels[0]}`);
        return response.data.labels[0];
        
      } catch (directError) {
        console.log(`[AI] Direct API also failed, using fallback: ${directError.message}`);
        return this.ruleBasedClassification(companyDescription);
      }
    }
  }

  async generateEmbedding(text) {
    console.log(`[AI] Generating HuggingFace embedding for text length: ${text.length}`);
    
    try {
      // Method 1: Try HuggingFace inference client
      const result = await this.hf.featureExtraction({
        model: "sentence-transformers/all-MiniLM-L6-v2",
        inputs: text.substring(0, 512) // Limit text length
      });
      
      console.log(`[AI] HF Embedding successful, dimensions: ${Array.isArray(result) ? result.length : 'unknown'}`);
      return Array.isArray(result[0]) ? result[0] : (Array.isArray(result) ? result : []);
      
    } catch (error) {
      console.log(`[AI] HF Client failed, trying direct API: ${error.message}`);
      
      try {
        // Method 2: Direct API call
        const response = await this.hfClient.post('/models/sentence-transformers/all-MiniLM-L6-v2', {
          inputs: text.substring(0, 512)
        });
        
        const embedding = response.data;
        console.log(`[AI] Direct HF API embedding successful, dimensions: ${Array.isArray(embedding) ? embedding.length : 'unknown'}`);
        return Array.isArray(embedding[0]) ? embedding[0] : (Array.isArray(embedding) ? embedding : []);
        
      } catch (directError) {
        console.log(`[AI] Direct API also failed, using fallback: ${directError.message}`);
        return this.fastHashEmbedding(text);
      }
    }
  }

  async findSimilarCompanies(targetCompany, companyList) {
    const targetEmbedding = await this.generateEmbedding(targetCompany.description);
    const similarities = [];

    for (const company of companyList) {
      const embedding = await this.generateEmbedding(company.description);
      const similarity = this.cosineSimilarity(targetEmbedding, embedding);
      
      similarities.push({
        company: company.name,
        similarity: similarity,
        reasoning: this.generateReasoning(targetCompany, company, similarity)
      });
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  // Advanced AI methods for enhanced similarity detection with progress tracking
  
  async discoverSimilarCompanies(targetRepo, githubClient, onProgress = null) {
    console.log(`[AI] Discovering similar companies for ${targetRepo.name}...`);
    
    try {
      if (onProgress) onProgress({ step: 'generating_queries', message: 'Generating intelligent search queries...' });
      
      // Generate search queries based on repo characteristics
      const searchQueries = this.generateSearchQueries(targetRepo);
      const discoveredCompanies = new Map();
      
      for (let i = 0; i < searchQueries.length; i++) {
        const query = searchQueries[i];
        try {
          if (onProgress) onProgress({ 
            step: 'searching_repos', 
            message: `Searching GitHub (${i+1}/${searchQueries.length}): ${query}`,
            progress: (i / searchQueries.length) * 50
          });
          
          console.log(`[AI] Searching GitHub: ${query}`);
          const searchResponse = await githubClient.get(`/search/repositories`, {
            params: {
              q: query,
              sort: 'stars',
              order: 'desc',
              per_page: 15
            }
          });
          
          // Extract unique companies from search results
          for (const repo of searchResponse.data.items) {
            if (repo.owner.type === 'Organization' || repo.owner.type === 'User') {
              const companyKey = repo.owner.login.toLowerCase();
              
              if (!discoveredCompanies.has(companyKey) && 
                  companyKey !== targetRepo.owner.toLowerCase()) {
                
                discoveredCompanies.set(companyKey, {
                  name: repo.owner.login,
                  avatar: repo.owner.avatar_url,
                  type: repo.owner.type,
                  sample_repo: {
                    name: repo.name,
                    description: repo.description,
                    language: repo.language,
                    stars: repo.stargazers_count,
                    topics: repo.topics || []
                  }
                });
              }
            }
          }
          
          // Rate limit protection
          await this.delay(800);
          
        } catch (searchError) {
          console.log(`[AI] Search failed for query "${query}": ${searchError.message}`);
        }
      }
      
      if (onProgress) onProgress({ 
        step: 'ranking_companies', 
        message: `AI ranking ${discoveredCompanies.size} discovered companies...`,
        progress: 60
      });
      
      // Use enhanced AI to rank discovered companies by similarity
      const rankedCompanies = await this.rankCompaniesBySimilarity(
        targetRepo, 
        Array.from(discoveredCompanies.values()),
        onProgress
      );
      
      console.log(`[AI] Discovered ${rankedCompanies.length} similar companies`);
      return rankedCompanies.slice(0, 12); // Top 12 most similar
      
    } catch (error) {
      console.log(`[AI] Company discovery failed: ${error.message}`);
      return this.fallbackSimilarCompanies(targetRepo);
    }
  }

  generateSearchQueries(repo) {
    const queries = [];
    
    // Language-based queries
    if (repo.language) {
      queries.push(`language:${repo.language} stars:>50`);
    }
    
    // Topic-based queries
    if (repo.topics && repo.topics.length > 0) {
      const topicQuery = repo.topics.slice(0, 2).join(' OR ');
      queries.push(`topic:${topicQuery} stars:>20`);
    }
    
    // Description-based semantic queries
    if (repo.description) {
      const keywords = this.extractKeywords(repo.description);
      if (keywords.length > 0) {
        queries.push(`${keywords.slice(0, 3).join(' ')} in:description stars:>10`);
      }
    }
    
    // Framework/library specific
    const frameworkKeywords = ['react', 'vue', 'angular', 'node', 'express', 'fastapi', 'django', 'rails', 'nextjs', 'nuxt'];
    const repoText = `${repo.name} ${repo.description || ''}`.toLowerCase();
    
    frameworkKeywords.forEach(framework => {
      if (repoText.includes(framework)) {
        queries.push(`${framework} stars:>30`);
      }
    });
    
    // Category-based queries
    const categories = this.detectRepoCategory(repo);
    if (categories.length > 0) {
      queries.push(`topic:${categories[0]} stars:>25`);
    }
    
    return queries.slice(0, 6); // Limit to 6 queries
  }
  
  extractKeywords(text) {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'];
    
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.includes(word))
      .slice(0, 5);
  }

  detectRepoCategory(repo) {
    const text = `${repo.name} ${repo.description || ''}`.toLowerCase();
    const categories = [];
    
    if (text.includes('web') || text.includes('frontend') || text.includes('ui')) {
      categories.push('frontend');
    }
    if (text.includes('api') || text.includes('backend') || text.includes('server')) {
      categories.push('backend');
    }
    if (text.includes('ai') || text.includes('ml') || text.includes('machine-learning')) {
      categories.push('machine-learning');
    }
    if (text.includes('mobile') || text.includes('ios') || text.includes('android')) {
      categories.push('mobile');
    }
    
    return categories;
  }

  async rankCompaniesBySimilarity(targetRepo, companies, onProgress = null) {
    const targetEmbedding = await this.generateEmbedding(
      `${targetRepo.name} ${targetRepo.description} ${targetRepo.language} ${targetRepo.topics?.join(' ')}`
    );
    
    const rankedCompanies = [];
    
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      
      if (onProgress) onProgress({ 
        step: 'ranking_companies', 
        message: `Analyzing similarity: ${company.name} (${i+1}/${companies.length})`,
        progress: 60 + (i / companies.length) * 20
      });
      
      const companyText = `${company.sample_repo.name} ${company.sample_repo.description} ${company.sample_repo.language} ${company.sample_repo.topics?.join(' ')}`;
      const companyEmbedding = await this.generateEmbedding(companyText);
      
      const similarity = this.cosineSimilarity(targetEmbedding, companyEmbedding);
      
      // Enhanced reasoning with specialized AI model
      const reasoning = await this.generateEnhancedCompanyReasoning(targetRepo, company, similarity);
      
      rankedCompanies.push({
        name: company.name,
        avatar: company.avatar,
        type: company.type,
        similarity_score: Math.round(similarity * 100) / 100,
        sample_repo: company.sample_repo,
        reasoning: reasoning.summary,
        detailed_reasoning: reasoning.detailed,
        confidence_score: reasoning.confidence
      });
      
      // Small delay to avoid overwhelming APIs
      await this.delay(150);
    }
    
    return rankedCompanies.sort((a, b) => b.similarity_score - a.similarity_score);
  }

  async generateEnhancedCompanyReasoning(targetRepo, company, similarity) {
    const reasons = [];
    const detailed = [];
    let confidence = similarity;
    
    // Language similarity
    if (targetRepo.language === company.sample_repo.language) {
      reasons.push(`Both use ${targetRepo.language}`);
      detailed.push(`Programming Language Match: Both repositories primarily use ${targetRepo.language}, indicating similar technical stacks and development expertise.`);
      confidence += 0.1;
    }
    
    // Topic overlap analysis
    if (targetRepo.topics && targetRepo.topics.length > 0 && company.sample_repo.topics) {
      const companyTopics = company.sample_repo.topics.map(t => t.toLowerCase());
      const targetTopics = targetRepo.topics.map(t => t.toLowerCase());
      const matchingTopics = targetTopics.filter(topic => 
        companyTopics.includes(topic) || 
        companyTopics.some(ct => ct.includes(topic) || topic.includes(ct))
      );
      
      if (matchingTopics.length > 0) {
        reasons.push(`Shared focus: ${matchingTopics.join(', ')}`);
        detailed.push(`Topic Alignment: Both projects focus on ${matchingTopics.join(', ')}, suggesting similar problem domains and target audiences.`);
        confidence += matchingTopics.length * 0.05;
      }
    }
    
    // Semantic analysis using AI
    const semanticReasoning = await this.generateAISemanticReasoning(targetRepo, company);
    if (semanticReasoning) {
      reasons.push(semanticReasoning.summary);
      detailed.push(semanticReasoning.detailed);
      confidence += 0.05;
    }
    
    // Star/popularity analysis
    const targetStars = targetRepo.stars || 0;
    const companyStars = company.sample_repo.stars || 0;
    const starRatio = Math.min(targetStars, companyStars) / Math.max(targetStars, companyStars);
    
    if (starRatio > 0.3) {
      reasons.push('Similar project scale');
      detailed.push(`Scale Similarity: Both projects have comparable community adoption (${targetStars.toLocaleString()} vs ${companyStars.toLocaleString()} stars), indicating similar market positioning.`);
      confidence += 0.05;
    }
    
    // Framework pattern detection
    const frameworkSimilarity = this.detectFrameworkSimilarity(targetRepo, company.sample_repo);
    if (frameworkSimilarity) {
      reasons.push(`${frameworkSimilarity} ecosystem`);
      detailed.push(`Framework Ecosystem: Both projects operate within the ${frameworkSimilarity} ecosystem, sharing similar architectural patterns and development practices.`);
      confidence += 0.1;
    }
    
    const summary = reasons.length > 0 ? reasons.join(', ') : 'Similar technology focus and approach';
    
    return {
      summary,
      detailed: detailed.join(' '),
      confidence: Math.min(confidence, 1.0)
    };
  }

  async generateAISemanticReasoning(targetRepo, company) {
    try {
      // Use a more specialized model for semantic analysis
      const prompt = `Analyze the relationship between these two software projects:

Project A: "${targetRepo.name}" - ${targetRepo.description || 'No description'}
Technology: ${targetRepo.language || 'Unknown'}

Project B: "${company.sample_repo.name}" - ${company.sample_repo.description || 'No description'}
Technology: ${company.sample_repo.language || 'Unknown'}

Provide a brief technical similarity analysis:`;
      
      const result = await this.hf.textGeneration({
        model: 'microsoft/DialoGPT-medium',
        inputs: prompt,
        parameters: {
          max_new_tokens: 30,
          temperature: 0.2,
          do_sample: true
        }
      });
      
      const generated = result.generated_text?.trim();
      if (generated && generated.length > 10) {
        return {
          summary: generated.slice(0, 50) + (generated.length > 50 ? '...' : ''),
          detailed: `AI Analysis: ${generated}`
        };
      }
      
    } catch (error) {
      console.log(`[AI] Semantic reasoning failed: ${error.message}`);
    }
    
    return null;
  }

  detectFrameworkSimilarity(repo1, repo2) {
    const text1 = `${repo1.name} ${repo1.description || ''}`.toLowerCase();
    const text2 = `${repo2.name} ${repo2.description || ''}`.toLowerCase();
    
    const frameworks = ['react', 'vue', 'angular', 'node', 'django', 'rails', 'spring', 'express', 'nextjs', 'nuxt'];
    
    for (const framework of frameworks) {
      if (text1.includes(framework) && text2.includes(framework)) {
        return framework.charAt(0).toUpperCase() + framework.slice(1);
      }
    }
    
    return null;
  }

  async analyzeSimilarContributors(targetRepo, similarRepos, githubClient, onProgress = null) {
    console.log(`[AI] Analyzing contributors across ${similarRepos.length + 1} similar repositories...`);
    console.log(`[AI] Target repo:`, targetRepo);
    console.log(`[AI] Similar repos:`, similarRepos);
    
    const allContributors = new Map();
    const reposToAnalyze = [targetRepo, ...similarRepos.slice(0, 4)]; // Limit to avoid rate limits
    
    console.log(`[AI] Final repos to analyze:`, reposToAnalyze.map(r => ({
      name: r.name,
      owner: r.owner,
      full_name: r.full_name,
      language: r.language
    })));
    
    if (onProgress) onProgress({ 
      step: 'fetching_contributors', 
      message: 'Fetching contributors from similar repositories...',
      progress: 80
    });
    
    // Collect contributors from all similar repos
    for (let i = 0; i < reposToAnalyze.length; i++) {
      const repo = reposToAnalyze[i];
      try {
        if (onProgress) onProgress({ 
          step: 'fetching_contributors', 
          message: `Analyzing contributors: ${repo.owner || repo.name}/${repo.name} (${i+1}/${reposToAnalyze.length})`,
          progress: 80 + (i / reposToAnalyze.length) * 10
        });
        
        const repoPath = repo.full_name || `${repo.owner}/${repo.name}`;
        console.log(`[AI] Fetching contributors for: ${repoPath}`);
        
        const contributorsResponse = await githubClient.get(`/repos/${repoPath}/contributors`, {
          params: { per_page: 30 }
        });
        
        console.log(`[AI] Found ${contributorsResponse.data.length} contributors for ${repoPath}`);
        
        contributorsResponse.data.forEach(contributor => {
          const key = contributor.login.toLowerCase();
          
          if (!allContributors.has(key)) {
            allContributors.set(key, {
              username: contributor.login,
              avatar: contributor.avatar_url,
              profile: contributor.html_url,
              repos_contributed: [],
              total_contributions: 0,
              analysis_pending: true
            });
          }
          
          const existingContributor = allContributors.get(key);
          
          // Check if this repo is already added to avoid duplicates
          const existingRepo = existingContributor.repos_contributed.find(r => r.repo === repoPath);
          if (!existingRepo) {
            existingContributor.repos_contributed.push({
              repo: repoPath,
              contributions: contributor.contributions,
              language: repo.language,
              stars: repo.stars || 0
            });
            existingContributor.total_contributions += contributor.contributions;
            console.log(`[AI] Added ${contributor.login} to ${repoPath} with ${contributor.contributions} contributions`);
          } else {
            console.log(`[AI] Skipped duplicate: ${contributor.login} already has ${repoPath}`);
          }
        });
        
        await this.delay(1200); // Rate limit protection
        
      } catch (error) {
        console.log(`[AI] Failed to fetch contributors for ${repo.owner || repo.name}/${repo.name}: ${error.message}`);
        if (error.response?.status === 404) {
          console.log(`[AI] Repository not found: ${repo.owner || repo.name}/${repo.name}`);
        } else if (error.response?.status === 403) {
          console.log(`[AI] Rate limited or access denied for: ${repo.owner || repo.name}/${repo.name}`);
        }
        // Continue with other repos even if one fails
      }
    }
    
    console.log(`[AI] Total unique contributors found: ${allContributors.size}`);
    
    // More flexible filtering - prioritize cross-repo contributors but include high-value single-repo ones
    const eligibleContributors = Array.from(allContributors.values())
      .filter(contributor => {
        const isMultiRepo = contributor.repos_contributed.length >= 2;
        const isHighContributor = contributor.total_contributions > 100;
        const isVeryHighContributor = contributor.total_contributions > 500;
        
        return isMultiRepo || isVeryHighContributor || (isHighContributor && contributor.repos_contributed.length >= 1);
      })
      .sort((a, b) => {
        // Prioritize multi-repo contributors, then by total contributions
        const aMultiRepo = a.repos_contributed.length >= 2;
        const bMultiRepo = b.repos_contributed.length >= 2;
        
        if (aMultiRepo && !bMultiRepo) return -1;
        if (!aMultiRepo && bMultiRepo) return 1;
        
        return b.total_contributions - a.total_contributions;
      });
    
    console.log(`[AI] Eligible contributors after filtering: ${eligibleContributors.length}`);
    
    if (onProgress) onProgress({ 
      step: 'analyzing_throughput', 
      message: `AI analyzing ${eligibleContributors.length} high-value contributors...`,
      progress: 90
    });
    
    // AI-powered contributor analysis
    const analyzedContributors = [];
    const maxContributors = Math.min(eligibleContributors.length, 8);
    
    for (let i = 0; i < maxContributors; i++) {
      const contributor = eligibleContributors[i];
      
      if (onProgress) onProgress({ 
        step: 'analyzing_throughput', 
        message: `Analyzing contributor: ${contributor.username} (${i+1}/${maxContributors})`,
        progress: 90 + (i / maxContributors) * 8
      });
      
      try {
        const analysis = await this.analyzeContributorThroughput(contributor, githubClient);
        analyzedContributors.push({
          ...contributor,
          ...analysis,
          analysis_pending: false
        });
        
        console.log(`[AI] Successfully analyzed ${contributor.username}: ${analysis.throughput_score} score, ${contributor.repos_contributed.length} repos`);
        
      } catch (error) {
        console.log(`[AI] Failed to analyze contributor ${contributor.username}: ${error.message}`);
        // Add with basic info if analysis fails
        analyzedContributors.push({
          ...contributor,
          throughput_score: Math.min(contributor.total_contributions / 10, 80),
          activity_level: 'Unknown',
          specialization: contributor.repos_contributed[0]?.language || 'Multi-language',
          assessment: 'Active contributor across multiple projects',
          analysis_pending: false
        });
      }
      
      await this.delay(400); // Rate limit protection
    }
    
    console.log(`[AI] Final analyzed contributors: ${analyzedContributors.length}`);
    return analyzedContributors;
  }

  async analyzeContributorThroughput(contributor, githubClient) {
    console.log(`[AI] Analyzing contributor throughput: ${contributor.username}`);
    
    try {
      // Get contributor's profile and recent activity
      const [profileResponse, eventsResponse] = await Promise.all([
        githubClient.get(`/users/${contributor.username}`),
        githubClient.get(`/users/${contributor.username}/events/public`, {
          params: { per_page: 100 }
        })
      ]);
      
      const profile = profileResponse.data;
      const events = eventsResponse.data;
      
      // Calculate activity metrics
      const metrics = this.calculateContributorMetrics(contributor, profile, events);
      
      // AI-powered assessment
      const aiAssessment = await this.generateContributorAssessment(contributor, metrics);
      
      return {
        throughput_score: metrics.throughputScore,
        activity_level: metrics.activityLevel,
        specialization: metrics.primaryLanguages,
        assessment: aiAssessment,
        metrics: {
          repos_count: profile.public_repos,
          followers: profile.followers,
          recent_commits: metrics.recentCommits,
          languages_used: metrics.languagesUsed
        }
      };
      
    } catch (error) {
      console.log(`[AI] Failed to analyze ${contributor.username}: ${error.message}`);
      
      return {
        throughput_score: this.estimateThroughputFromContributions(contributor),
        activity_level: 'Unknown',
        specialization: contributor.repos_contributed[0]?.language || 'Multi-language',
        assessment: 'Active contributor across similar projects',
        metrics: {
          repos_count: 'N/A',
          followers: 'N/A',
          recent_commits: contributor.total_contributions,
          languages_used: [...new Set(contributor.repos_contributed.map(r => r.language))].filter(Boolean)
        }
      };
    }
  }

  calculateContributorMetrics(contributor, profile, events) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Recent activity analysis
    const recentEvents = events.filter(event => new Date(event.created_at) > thirtyDaysAgo);
    const recentCommits = recentEvents.filter(event => event.type === 'PushEvent').length;
    
    // Language analysis
    const languagesUsed = [...new Set(contributor.repos_contributed.map(r => r.language))].filter(Boolean);
    const primaryLanguages = languagesUsed.slice(0, 3);
    
    // Throughput scoring (0-100)
    const baseScore = Math.min(contributor.total_contributions / 10, 50); // Max 50 from contributions
    const recentActivity = Math.min(recentCommits * 2, 25); // Max 25 from recent activity
    const diversityBonus = Math.min(languagesUsed.length * 2, 15); // Max 15 from language diversity
    const socialScore = Math.min(profile.followers / 10, 10); // Max 10 from followers
    
    const throughputScore = Math.round(baseScore + recentActivity + diversityBonus + socialScore);
    
    // Activity level classification
    let activityLevel;
    if (recentCommits > 20) activityLevel = 'Very High';
    else if (recentCommits > 10) activityLevel = 'High';
    else if (recentCommits > 5) activityLevel = 'Moderate';
    else if (recentCommits > 0) activityLevel = 'Low';
    else activityLevel = 'Inactive';
    
    return {
      throughputScore,
      activityLevel,
      recentCommits,
      languagesUsed,
      primaryLanguages: primaryLanguages.join(', ') || 'Multi-language'
    };
  }

  async generateContributorAssessment(contributor, metrics) {
    const assessmentPoints = [];
    
    // Throughput assessment
    if (metrics.throughputScore > 80) {
      assessmentPoints.push('Exceptional productivity and engagement');
    } else if (metrics.throughputScore > 60) {
      assessmentPoints.push('Strong consistent contributions');
    } else if (metrics.throughputScore > 40) {
      assessmentPoints.push('Regular contributor with steady output');
    } else {
      assessmentPoints.push('Emerging contributor with growth potential');
    }
    
    // Multi-repo expertise
    if (contributor.repos_contributed.length > 3) {
      assessmentPoints.push('Cross-project expertise');
    }
    
    // Language diversity
    if (metrics.languagesUsed.length > 2) {
      assessmentPoints.push('Multi-language proficiency');
    }
    
    // Recent activity
    if (metrics.activityLevel === 'Very High' || metrics.activityLevel === 'High') {
      assessmentPoints.push('Currently very active');
    }
    
    return assessmentPoints.join(', ') || 'Active open source contributor';
  }

  estimateThroughputFromContributions(contributor) {
    const totalContributions = contributor.total_contributions;
    const repoCount = contributor.repos_contributed.length;
    
    const baseScore = Math.min(totalContributions / 10, 60);
    const diversityBonus = Math.min(repoCount * 5, 20);
    
    return Math.round(baseScore + diversityBonus);
  }

  fallbackSimilarCompanies(targetRepo) {
    // Fallback list based on common patterns
    const fallbackCompanies = [
      { name: 'github', type: 'Organization' },
      { name: 'microsoft', type: 'Organization' },
      { name: 'google', type: 'Organization' },
      { name: 'facebook', type: 'Organization' },
      { name: 'vercel', type: 'Organization' }
    ];
    
    return fallbackCompanies.map(company => ({
      name: company.name,
      avatar: `https://github.com/${company.name}.png`,
      type: company.type,
      similarity_score: 0.5,
      sample_repo: { name: 'N/A', description: 'Similar technology focus', language: targetRepo.language },
      reasoning: 'Similar technology ecosystem'
    }));
  }

  // Fallback methods for speed and reliability
  ruleBasedClassification(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('react') || desc.includes('vue') || desc.includes('angular') || desc.includes('frontend')) {
      return 'Web Development';
    } else if (desc.includes('ai') || desc.includes('machine learning') || desc.includes('ml') || desc.includes('neural')) {
      return 'AI/ML Company';
    } else if (desc.includes('ide') || desc.includes('editor') || desc.includes('build') || desc.includes('testing')) {
      return 'Developer Tools';
    } else if (desc.includes('database') || desc.includes('cloud') || desc.includes('server') || desc.includes('api')) {
      return 'Backend/Infrastructure';
    } else if (desc.includes('mobile') || desc.includes('ios') || desc.includes('android') || desc.includes('flutter')) {
      return 'Mobile Development';
    }
    
    return 'General Technology';
  }

  fastHashEmbedding(text) {
    // Simple hash-based embedding as fallback
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(384).fill(0); // Match MiniLM dimensions
    
    words.forEach((word, i) => {
      const hash = this.simpleHash(word);
      embedding[hash % 384] += 1;
    });
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  extractCategory(generatedText) {
    const categories = [
      'Web Development', 'AI/ML Company', 'Developer Tools', 
      'Backend/Infrastructure', 'Mobile Development'
    ];
    
    for (const category of categories) {
      if (generatedText.toLowerCase().includes(category.toLowerCase())) {
        return category;
      }
    }
    
    return 'General Technology';
  }

  generateReasoning(company1, company2, similarity) {
    const techOverlap = this.getTechStackOverlap(company1.tech_stack || [], company2.tech_stack || []);
    const reasons = [];
    
    if (similarity > 0.8) {
      reasons.push("Very high semantic similarity in descriptions");
    } else if (similarity > 0.6) {
      reasons.push("Strong semantic similarity");
    } else if (similarity > 0.4) {
      reasons.push("Moderate semantic similarity");
    }
    
    if (techOverlap.length > 0) {
      reasons.push(`Shared technologies: ${techOverlap.join(', ')}`);
    }
    
    return reasons.length > 0 ? reasons.join('. ') : 'Similar company focus and approach';
  }

  getTechStackOverlap(stack1, stack2) {
    return stack1.filter(tech => 
      stack2.some(t => t.toLowerCase().includes(tech.toLowerCase()) || 
                      tech.toLowerCase().includes(t.toLowerCase()))
    );
  }

  // Utility method for delays
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Test the fast client
async function testFastAI() {
  console.log("🚀 Testing Fast AI Client (No Training Required)");
  console.log("=" * 50);
  
  const client = new FastAIClient();
  
  // Test classification
  const companyDesc = "React library creators. Focus on JavaScript, declarative UI, frontend frameworks.";
  const category = await client.classifyCompany(companyDesc);
  console.log(`✅ Company classified as: ${category}`);
  
  // Test similarity
  const companies = [
    { name: "vercel", description: "Next.js creators, TypeScript and React focus", tech_stack: ["TypeScript", "React"] },
    { name: "facebook", description: companyDesc, tech_stack: ["JavaScript", "React"] }
  ];
  
  const similar = await client.findSimilarCompanies(companies[1], [companies[0]]);
  console.log(`✅ Similar companies found:`, similar);
  
  console.log("\n🎯 READY IN 5 MINUTES - NO TRAINING NEEDED!");
}

if (require.main === module) {
  testFastAI().catch(console.error);
}

module.exports = { FastAIClient }; 