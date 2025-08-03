#!/usr/bin/env node

// 🚀 ENHANCED AI CLIENT - Best Free HuggingFace Models
// Fixed API calls with proper error handling and response parsing

const { HfInference } = require('@huggingface/inference');
require('dotenv').config();

class EnhancedAIClient {
  constructor() {
    // Initialize HuggingFace client
    this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
    
    // ✨ BEST FREE MODELS for your requirements
    this.models = {
      // 1. SIMILARITY & EMBEDDINGS - Best quality
      embeddings: "sentence-transformers/all-mpnet-base-v2", // 768 dimensions, excellent quality
      embeddings_fast: "sentence-transformers/all-MiniLM-L6-v2", // 384 dimensions, very fast
      
      // 2. TECH STACK CLASSIFICATION - Best for coding
      classifier: "microsoft/codebert-base", // Specialized for code understanding
      zeroshot: "facebook/bart-large-mnli", // Best zero-shot classification
      
      // 3. TEXT SUMMARIZATION - Best for contributor summaries
      summarizer: "facebook/bart-large-cnn", // Top summarization model
      
      // 4. SENTIMENT ANALYSIS - Already good
      sentiment: "cardiffnlp/twitter-roberta-base-sentiment-latest",
      
      // 5. TECH STACK DETECTION - Custom approach
      techstack: "microsoft/DialoGPT-medium"
    };
    
    // Caches for performance
    this.embeddingCache = new Map();
    this.classificationCache = new Map();
    this.summaryCache = new Map();
    
    console.log('✅ Enhanced AI Client initialized with best models!');
  }

  // ===== 1. COMPANY SIMILARITY BY TECH STACK =====
  async analyzeCompanyTechStack(companyData) {
    console.log(`[AI] Analyzing tech stack for company: ${companyData.name}`);
    
    try {
      // Create comprehensive tech description
      const techDescription = this.buildTechStackDescription(companyData);
      
      // Generate embedding for similarity comparison
      const embedding = await this.generateEmbedding(techDescription);
      
      // Classify tech stack categories
      const classification = await this.classifyTechStack(techDescription);
      
      return {
        company: companyData.name,
        techStackEmbedding: embedding,
        primaryTech: classification.primary_category,
        techCategories: classification.all_categories,
        techDescription: techDescription,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.log(`[AI] Error analyzing company tech stack: ${error.message}`);
      return this.fallbackTechStackAnalysis(companyData);
    }
  }

  // ===== 2. CONTRIBUTOR SIMILARITY & RECOMMENDATIONS =====
  async analyzeContributor(contributorData) {
    console.log(`[AI] Analyzing contributor: ${contributorData.login}`);
    
    try {
      // Build contributor profile
      const profile = this.buildContributorProfile(contributorData);
      
      // Generate embedding for similarity
      const embedding = await this.generateEmbedding(profile);
      
      // Classify contributor type
      const classification = await this.classifyContributor(profile);
      
      return {
        login: contributorData.login,
        profileEmbedding: embedding,
        contributorType: classification.primary_category,
        expertise: classification.all_categories,
        profile: profile,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.log(`[AI] Error analyzing contributor: ${error.message}`);
      return this.fallbackContributorAnalysis(contributorData);
    }
  }

  // ===== 3. CONTRIBUTOR RANKING & SUMMARIES =====
  async generateContributorSummary(contributorData) {
    console.log(`[AI] Generating summary for: ${contributorData.login}`);
    
    try {
      // Build detailed contributor description
      const description = this.buildDetailedContributorDescription(contributorData);
      
      // Generate AI summary
      const summary = await this.hf.summarization({
        model: this.models.summarizer,
        inputs: description,
        parameters: {
          max_length: 150,
          min_length: 50,
          do_sample: false
        }
      });

      // Extract insights
      const insights = this.extractContributorInsights(contributorData);
      
      return {
        login: contributorData.login,
        summary: summary.summary_text || summary[0]?.summary_text || "Active contributor with diverse technical contributions",
        insights: insights,
        ranking: this.calculateContributorRanking(contributorData),
        expertise: this.identifyExpertise(contributorData),
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.log(`[AI] Error generating contributor summary: ${error.message}`);
      return this.fallbackContributorSummary(contributorData);
    }
  }

  // ===== CORE AI METHODS =====
  
  async generateEmbedding(text, useHighQuality = true) {
    const cacheKey = `emb_${text.substring(0, 50)}_${useHighQuality}`;
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey);
    }

    try {
      const model = useHighQuality ? this.models.embeddings : this.models.embeddings_fast;
      console.log(`[AI] Generating embedding with ${model}...`);
      
      // Limit text length for API
      const cleanText = text.substring(0, 512).trim();
      
      const result = await this.hf.featureExtraction({
        model: model,
        inputs: cleanText
      });
      
      // Handle different response formats
      let embedding;
      if (Array.isArray(result) && Array.isArray(result[0])) {
        embedding = result[0]; // Nested array format
      } else if (Array.isArray(result)) {
        embedding = result; // Direct array format
      } else {
        throw new Error('Unexpected embedding format');
      }
      
      this.embeddingCache.set(cacheKey, embedding);
      console.log(`[AI] Generated ${embedding.length}-dimensional embedding`);
      
      return embedding;
      
    } catch (error) {
      console.log(`[AI] Embedding failed: ${error.message}`);
      return this.generateFallbackEmbedding(text);
    }
  }

  async classifyTechStack(description) {
    try {
      const techCategories = [
        "Frontend Development", "Backend Development", "Full Stack Development",
        "Mobile Development", "DevOps/Infrastructure", "Data Science/ML",
        "Game Development", "Blockchain/Web3", "Developer Tools",
        "Cloud Services", "Database/Storage", "Security/Privacy"
      ];

      const result = await this.hf.zeroShotClassification({
        model: this.models.zeroshot,
        inputs: description,
        parameters: { 
          candidate_labels: techCategories,
          multi_label: true 
        }
      });

      // Safe response parsing
      const labels = result.labels || [];
      const scores = result.scores || [];
      
      return {
        primary_category: labels[0] || "Unknown",
        confidence: scores[0] || 0,
        all_categories: labels.slice(0, 3).map((label, i) => ({
          category: label,
          confidence: scores[i] || 0
        }))
      };
      
    } catch (error) {
      console.log(`[AI] Classification failed: ${error.message}`);
      return this.fallbackClassification(description);
    }
  }

  async classifyContributor(profile) {
    try {
      const contributorTypes = [
        "Core Maintainer", "Active Contributor", "Documentation Expert",
        "Bug Hunter", "Feature Developer", "Community Helper",
        "Performance Optimizer", "Security Expert", "UI/UX Specialist",
        "Backend Developer", "Frontend Developer", "DevOps Engineer"
      ];

      const result = await this.hf.zeroShotClassification({
        model: this.models.zeroshot,
        inputs: profile,
        parameters: { 
          candidate_labels: contributorTypes,
          multi_label: true 
        }
      });

      // Safe response parsing
      const labels = result.labels || [];
      const scores = result.scores || [];
      
      return {
        primary_category: labels[0] || "Contributor",
        confidence: scores[0] || 0,
        all_categories: labels.slice(0, 3).map((label, i) => ({
          category: label,
          confidence: scores[i] || 0
        }))
      };
      
    } catch (error) {
      console.log(`[AI] Contributor classification failed: ${error.message}`);
      return this.fallbackContributorClassification(profile);
    }
  }

  // ===== SIMILARITY CALCULATIONS =====
  
  calculateSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0;
    }

    // Cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return Math.max(0, Math.min(1, similarity)); // Clamp between 0 and 1
  }

  async findSimilarCompanies(targetCompany, companyList, limit = 5) {
    console.log(`[AI] Finding companies similar to ${targetCompany.name}...`);
    
    try {
      const targetAnalysis = await this.analyzeCompanyTechStack(targetCompany);
      const similarities = [];

      for (const company of companyList.slice(0, 20)) { // Limit for performance
        if (company.name === targetCompany.name) continue;
        
        const companyAnalysis = await this.analyzeCompanyTechStack(company);
        const similarity = this.calculateSimilarity(
          targetAnalysis.techStackEmbedding,
          companyAnalysis.techStackEmbedding
        );

        similarities.push({
          company: company.name,
          similarity: similarity,
          techStack: companyAnalysis.primaryTech,
          reasoning: this.generateSimilarityReasoning(targetAnalysis, companyAnalysis, similarity)
        });
      }

      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
        
    } catch (error) {
      console.log(`[AI] Error finding similar companies: ${error.message}`);
      return [];
    }
  }

  async findSimilarContributors(targetContributor, contributorList, limit = 5) {
    console.log(`[AI] Finding contributors similar to ${targetContributor.login}...`);
    
    try {
      const targetAnalysis = await this.analyzeContributor(targetContributor);
      const similarities = [];

      for (const contributor of contributorList.slice(0, 15)) { // Limit for performance
        if (contributor.login === targetContributor.login) continue;
        
        const contributorAnalysis = await this.analyzeContributor(contributor);
        const similarity = this.calculateSimilarity(
          targetAnalysis.profileEmbedding,
          contributorAnalysis.profileEmbedding
        );

        similarities.push({
          login: contributor.login,
          similarity: similarity,
          type: contributorAnalysis.contributorType,
          reasoning: this.generateContributorSimilarityReasoning(targetAnalysis, contributorAnalysis, similarity)
        });
      }

      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
        
    } catch (error) {
      console.log(`[AI] Error finding similar contributors: ${error.message}`);
      return [];
    }
  }

  // ===== HELPER METHODS =====
  
  buildTechStackDescription(companyData) {
    const parts = [
      `Company: ${companyData.name}`,
      `Repositories: ${companyData.repositories?.length || 0}`,
      `Main Languages: ${this.extractMainLanguages(companyData)}`,
      `Popular Frameworks: ${this.extractFrameworks(companyData)}`,
      `Repository Topics: ${this.extractTopics(companyData)}`,
      `Development Focus: ${this.inferDevelopmentFocus(companyData)}`
    ];
    
    return parts.join('. ');
  }

  buildContributorProfile(contributorData) {
    const parts = [
      `Developer: ${contributorData.login}`,
      `Contributions: ${contributorData.contributions || 0}`,
      `Primary Languages: ${this.inferContributorLanguages(contributorData)}`,
      `Contribution Types: ${this.inferContributionTypes(contributorData)}`,
      `Activity Level: ${this.inferActivityLevel(contributorData)}`,
      `Expertise Areas: ${this.inferExpertiseAreas(contributorData)}`
    ];
    
    return parts.join('. ');
  }

  buildDetailedContributorDescription(contributorData) {
    return `${contributorData.login} is a software developer who has made ${contributorData.contributions || 0} contributions. ` +
           `They work primarily with ${this.inferContributorLanguages(contributorData)} and focus on ${this.inferContributionTypes(contributorData)}. ` +
           `Their activity level is ${this.inferActivityLevel(contributorData)} and they show expertise in ${this.inferExpertiseAreas(contributorData)}. ` +
           `Based on their contribution patterns, they demonstrate skills in ${this.inferSkillAreas(contributorData)}.`;
  }

  extractMainLanguages(companyData) {
    if (!companyData.repositories) return "Various";
    
    const languages = new Map();
    companyData.repositories.forEach(repo => {
      if (repo.language) {
        languages.set(repo.language, (languages.get(repo.language) || 0) + 1);
      }
    });
    
    return Array.from(languages.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([lang]) => lang)
      .join(', ') || "Various";
  }

  extractFrameworks(companyData) {
    if (!companyData.repositories) return "Various";
    
    const frameworks = new Set();
    companyData.repositories.forEach(repo => {
      if (repo.topics) {
        repo.topics.forEach(topic => {
          if (this.isFramework(topic)) {
            frameworks.add(topic);
          }
        });
      }
    });
    
    return Array.from(frameworks).slice(0, 5).join(', ') || "Various";
  }

  isFramework(topic) {
    const frameworks = [
      'react', 'vue', 'angular', 'nodejs', 'express', 'django', 'flask',
      'spring', 'laravel', 'rails', 'nextjs', 'nuxt', 'svelte', 'ember'
    ];
    return frameworks.includes(topic.toLowerCase());
  }

  extractTopics(companyData) {
    if (!companyData.repositories) return "Various";
    
    const allTopics = new Set();
    companyData.repositories.forEach(repo => {
      if (repo.topics) {
        repo.topics.forEach(topic => allTopics.add(topic));
      }
    });
    
    return Array.from(allTopics).slice(0, 10).join(', ') || "Various";
  }

  inferDevelopmentFocus(companyData) {
    if (!companyData.repositories) return "General Software Development";
    
    const keywords = new Map();
    companyData.repositories.forEach(repo => {
      const text = `${repo.name} ${repo.description || ''}`.toLowerCase();
      
      if (text.includes('api') || text.includes('backend')) keywords.set('Backend', (keywords.get('Backend') || 0) + 1);
      if (text.includes('frontend') || text.includes('ui')) keywords.set('Frontend', (keywords.get('Frontend') || 0) + 1);
      if (text.includes('mobile') || text.includes('app')) keywords.set('Mobile', (keywords.get('Mobile') || 0) + 1);
      if (text.includes('ml') || text.includes('ai')) keywords.set('AI/ML', (keywords.get('AI/ML') || 0) + 1);
      if (text.includes('devops') || text.includes('deploy')) keywords.set('DevOps', (keywords.get('DevOps') || 0) + 1);
    });
    
    const topFocus = Array.from(keywords.entries()).sort((a, b) => b[1] - a[1])[0];
    return topFocus ? topFocus[0] : "General Software Development";
  }

  inferContributorLanguages(contributorData) {
    // This would ideally come from GitHub API analysis of their contributions
    return "JavaScript, Python, TypeScript"; // Fallback
  }

  inferContributionTypes(contributorData) {
    return "Code contributions, Documentation, Bug fixes"; // Fallback
  }

  inferActivityLevel(contributorData) {
    const contributions = contributorData.contributions || 0;
    if (contributions > 100) return "Very Active";
    if (contributions > 20) return "Active";
    if (contributions > 5) return "Moderate";
    return "Occasional";
  }

  inferExpertiseAreas(contributorData) {
    return "Full-stack development, Open source collaboration"; // Fallback
  }

  inferSkillAreas(contributorData) {
    return "problem-solving, code quality, team collaboration"; // Fallback
  }

  extractContributorInsights(contributorData) {
    return {
      contributions: contributorData.contributions || 0,
      estimated_impact: this.estimateImpact(contributorData),
      collaboration_style: this.inferCollaborationStyle(contributorData),
      technical_depth: this.inferTechnicalDepth(contributorData)
    };
  }

  estimateImpact(contributorData) {
    const contributions = contributorData.contributions || 0;
    if (contributions > 50) return "High";
    if (contributions > 10) return "Medium";
    return "Growing";
  }

  inferCollaborationStyle(contributorData) {
    return "Team-oriented"; // Fallback
  }

  inferTechnicalDepth(contributorData) {
    return "Experienced"; // Fallback
  }

  calculateContributorRanking(contributorData) {
    const base = contributorData.contributions || 0;
    // Simple ranking algorithm - can be enhanced
    return Math.min(100, Math.floor(base * 2 + Math.random() * 20));
  }

  identifyExpertise(contributorData) {
    return ["Software Development", "Open Source"]; // Fallback
  }

  generateSimilarityReasoning(target, comparison, similarity) {
    const percentage = Math.round(similarity * 100);
    const techMatch = target.primaryTech === comparison.primaryTech;
    
    if (percentage > 80) {
      return `Very similar tech stacks (${percentage}% match). Both focus on ${target.primaryTech}.`;
    } else if (techMatch) {
      return `Similar primary technology (${target.primaryTech}) with ${percentage}% overall compatibility.`;
    } else {
      return `Different tech focus but complementary approaches (${percentage}% compatibility).`;
    }
  }

  generateContributorSimilarityReasoning(target, comparison, similarity) {
    const percentage = Math.round(similarity * 100);
    const typeMatch = target.contributorType === comparison.contributorType;
    
    if (percentage > 80) {
      return `Very similar contribution patterns (${percentage}% match). Both are ${target.contributorType}s.`;
    } else if (typeMatch) {
      return `Same contributor type (${target.contributorType}) with ${percentage}% profile similarity.`;
    } else {
      return `Different contribution styles but compatible skills (${percentage}% match).`;
    }
  }

  // ===== FALLBACK METHODS =====
  
  generateFallbackEmbedding(text) {
    // Simple hash-based embedding as fallback
    const hash = this.simpleHash(text);
    const embedding = new Array(384).fill(0);
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = ((hash + i) % 1000) / 1000 - 0.5;
    }
    return embedding;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  fallbackClassification(text) {
    // Rule-based fallback classification
    const lower = text.toLowerCase();
    
    if (lower.includes('react') || lower.includes('frontend')) {
      return { primary_category: "Frontend Development", confidence: 0.7, all_categories: [{ category: "Frontend Development", confidence: 0.7 }] };
    } else if (lower.includes('api') || lower.includes('backend')) {
      return { primary_category: "Backend Development", confidence: 0.7, all_categories: [{ category: "Backend Development", confidence: 0.7 }] };
    } else if (lower.includes('mobile') || lower.includes('ios') || lower.includes('android')) {
      return { primary_category: "Mobile Development", confidence: 0.7, all_categories: [{ category: "Mobile Development", confidence: 0.7 }] };
    }
    
    return { primary_category: "General Development", confidence: 0.5, all_categories: [{ category: "General Development", confidence: 0.5 }] };
  }

  fallbackTechStackAnalysis(companyData) {
    return {
      company: companyData.name,
      techStackEmbedding: this.generateFallbackEmbedding(companyData.name || ""),
      primaryTech: "Software Development",
      techCategories: [{ category: "Software Development", confidence: 0.5 }],
      techDescription: `${companyData.name} software development company`,
      timestamp: new Date().toISOString()
    };
  }

  fallbackContributorAnalysis(contributorData) {
    return {
      login: contributorData.login,
      profileEmbedding: this.generateFallbackEmbedding(contributorData.login || ""),
      contributorType: "Active Contributor",
      expertise: [{ category: "Software Development", confidence: 0.5 }],
      profile: `${contributorData.login} is an active contributor`,
      timestamp: new Date().toISOString()
    };
  }

  fallbackContributorClassification(profile) {
    return {
      primary_category: "Active Contributor",
      confidence: 0.5,
      all_categories: [{ category: "Active Contributor", confidence: 0.5 }]
    };
  }

  fallbackContributorSummary(contributorData) {
    return {
      login: contributorData.login,
      summary: `${contributorData.login} is an active software contributor with ${contributorData.contributions || 0} contributions to open source projects.`,
      insights: this.extractContributorInsights(contributorData),
      ranking: this.calculateContributorRanking(contributorData),
      expertise: ["Software Development"],
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { EnhancedAIClient }; 