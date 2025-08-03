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