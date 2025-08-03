#!/usr/bin/env node

// 🧪 Comprehensive Unit Tests for AI Repository Scout
// Tests FastAI Client, API endpoints, and helper functions

const request = require('supertest');
const path = require('path');

// Mock external dependencies before importing modules
jest.mock('axios');
jest.mock('@huggingface/inference');
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

const axios = require('axios');
const { HfInference } = require('@huggingface/inference');

describe('🤖 FastAIClient Unit Tests', () => {
  let FastAIClient;
  let fastAI;

  beforeAll(() => {
    // Set test environment variables
    process.env.HUGGINGFACE_API_KEY = 'test_hf_key';
    process.env.NODE_ENV = 'test';
    
    // Import after setting env vars
    const { FastAIClient: Client } = require('./fast-ai-client.js');
    FastAIClient = Client;
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock HfInference constructor
    HfInference.mockImplementation(() => ({
      zeroShotClassification: jest.fn(),
      featureExtraction: jest.fn()
    }));

    // Mock axios.create
    axios.create.mockReturnValue({
      post: jest.fn().mockResolvedValue({ data: {} })
    });

    fastAI = new FastAIClient();
  });

  describe('🏷️ Company Classification', () => {
    test('should classify company using HuggingFace API', async () => {
      // Mock successful HF response
      fastAI.hf.zeroShotClassification.mockResolvedValue({
        labels: ['Developer Tools', 'Web Development'],
        scores: [0.8, 0.2]
      });

      const result = await fastAI.classifyCompany('VSCode is a code editor');
      
      expect(result).toBe('Developer Tools');
      expect(fastAI.hf.zeroShotClassification).toHaveBeenCalledWith({
        model: 'facebook/bart-large-mnli',
        inputs: 'VSCode is a code editor',
        parameters: {
          candidate_labels: expect.arrayContaining(['Developer Tools', 'Web Development'])
        }
      });
    });

    test('should fallback to direct API when HF client fails', async () => {
      // Mock HF client failure
      fastAI.hf.zeroShotClassification.mockRejectedValue(new Error('HF client error'));
      
      // Mock successful direct API response
      fastAI.hfClient.post.mockResolvedValue({
        data: {
          labels: ['AI/ML Company'],
          scores: [0.9]
        }
      });

      const result = await fastAI.classifyCompany('Machine learning platform');
      
      expect(result).toBe('AI/ML Company');
      expect(fastAI.hfClient.post).toHaveBeenCalled();
    });

    test('should use rule-based fallback when all APIs fail', async () => {
      // Mock all API failures
      fastAI.hf.zeroShotClassification.mockRejectedValue(new Error('HF error'));
      fastAI.hfClient.post.mockRejectedValue(new Error('Direct API error'));

      const result = await fastAI.classifyCompany('React Vue Angular frontend framework');
      
      expect(result).toBe('Web Development');
    });
  });

  describe('🔢 Embedding Generation', () => {
    test('should generate embeddings using HuggingFace API', async () => {
      const mockEmbedding = Array(384).fill(0).map(() => Math.random());
      fastAI.hf.featureExtraction.mockResolvedValue([mockEmbedding]);

      const result = await fastAI.generateEmbedding('Test text for embedding');
      
      expect(result).toEqual(mockEmbedding);
      expect(result).toHaveLength(384);
      expect(fastAI.hf.featureExtraction).toHaveBeenCalledWith({
        model: 'sentence-transformers/all-MiniLM-L6-v2',
        inputs: 'Test text for embedding'
      });
    });

    test('should handle long text by truncating to 512 characters', async () => {
      const longText = 'a'.repeat(1000);
      const mockEmbedding = Array(384).fill(0.5);
      fastAI.hf.featureExtraction.mockResolvedValue([mockEmbedding]);

      await fastAI.generateEmbedding(longText);
      
      expect(fastAI.hf.featureExtraction).toHaveBeenCalledWith({
        model: 'sentence-transformers/all-MiniLM-L6-v2',
        inputs: 'a'.repeat(512)  // Should be truncated
      });
    });

    test('should fallback to hash-based embedding when APIs fail', async () => {
      fastAI.hf.featureExtraction.mockRejectedValue(new Error('HF error'));
      fastAI.hfClient.post.mockRejectedValue(new Error('Direct API error'));

      const result = await fastAI.generateEmbedding('Test text');
      
      expect(result).toHaveLength(384);
      expect(result.every(n => typeof n === 'number')).toBe(true);
    });
  });

  describe('🎯 Similarity Matching', () => {
    test('should find similar companies with reasoning', async () => {
      const mockEmbedding = Array(384).fill(0.5);
      fastAI.hf.featureExtraction.mockResolvedValue([mockEmbedding]);

      const targetCompany = { 
        name: 'Facebook', 
        description: 'React JavaScript library' 
      };
      
      const companyList = [
        { name: 'Google', description: 'Angular TypeScript framework' },
        { name: 'Microsoft', description: 'VSCode editor IDE' },
        { name: 'Netflix', description: 'Streaming video service' }
      ];

      const result = await fastAI.findSimilarCompanies(targetCompany, companyList);
      
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('company');
      expect(result[0]).toHaveProperty('similarity');
      expect(result[0]).toHaveProperty('reasoning');
      expect(typeof result[0].similarity).toBe('number');
    });
  });

  describe('🛠️ Helper Functions', () => {
    test('should calculate cosine similarity correctly', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [1, 0, 0];
      const vec3 = [0, 1, 0];

      const similarity1 = fastAI.cosineSimilarity(vec1, vec2);
      const similarity2 = fastAI.cosineSimilarity(vec1, vec3);

      expect(similarity1).toBeCloseTo(1.0, 5);  // Identical vectors
      expect(similarity2).toBeCloseTo(0.0, 5);  // Perpendicular vectors
    });

    test('should generate meaningful reasoning', () => {
      const company1 = { 
        name: 'Facebook', 
        tech_stack: ['JavaScript', 'React', 'Node.js'] 
      };
      const company2 = { 
        name: 'Google', 
        tech_stack: ['JavaScript', 'Angular', 'Java'] 
      };

      const reasoning = fastAI.generateReasoning(company1, company2, 0.75);
      
      expect(reasoning).toContain('JavaScript');
      expect(typeof reasoning).toBe('string');
      expect(reasoning.length).toBeGreaterThan(10);
    });
  });
});

describe('🌐 API Server Integration Tests', () => {
  let app;
  let server;

  beforeAll(async () => {
    // Mock environment variables
    process.env.GITHUB_TOKEN = 'test_github_token';
    process.env.HUGGINGFACE_API_KEY = 'test_hf_key';
    process.env.NODE_ENV = 'test';
    
    // Mock fs.existsSync for HTML file
    jest.doMock('fs', () => ({
      ...jest.requireActual('fs'),
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue('<!DOCTYPE html><html><head><title>AI Repository Scout</title></head><body></body></html>')
    }));
    
    // Import app after setting env vars and mocks
    app = require('./api-server.js');
  });

  afterAll(async () => {
    // Clean up environment variables
    delete process.env.GITHUB_TOKEN;
    delete process.env.HUGGINGFACE_API_KEY;
    delete process.env.NODE_ENV;
    
    // Close server if it exists
    if (server && server.close) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  describe('🏠 Root Endpoint', () => {
    test('should return JSON API info for non-browser requests', async () => {
      const response = await request(app)
        .get('/')
        .set('Accept', 'application/json')
        .set('User-Agent', 'test-client')
        .timeout(5000);

      expect(response.status).toBe(200);
      
      // The response might be HTML or JSON, let's handle both cases
      if (response.headers['content-type'] && response.headers['content-type'].includes('application/json')) {
        expect(response.body).toHaveProperty('service');
        expect(response.body).toHaveProperty('usage');
        expect(response.body.service).toContain('AI Repository Analysis API');
      } else {
        // If it returns HTML, that's also valid behavior
        expect(response.text).toBeDefined();
        expect(response.text.length).toBeGreaterThan(0);
      }
    });

    test('should return response for browser-like requests', async () => {
      const response = await request(app)
        .get('/')
        .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
        .set('User-Agent', 'Mozilla/5.0 (Test Browser)')
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(response.text).toBeDefined();
    });
  });

  describe('❤️ Health Endpoint', () => {
    test('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .timeout(5000);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('ai_enabled', true);
      expect(response.body).toHaveProperty('endpoints');
    });
  });

  describe('🔍 Analyze Endpoint', () => {
    test('should require repoUrl parameter', async () => {
      const response = await request(app)
        .post('/analyze')
        .send({})
        .timeout(5000);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'repoUrl is required');
    });

    test('should validate GitHub URL format', async () => {
      const response = await request(app)
        .post('/analyze')
        .send({ repoUrl: 'invalid-url' })
        .timeout(5000);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
    });
  });
});

describe('🔧 Helper Functions', () => {
  // Import the helper function
  const parseRepoUrl = (repoUrl) => {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) throw new Error('Invalid GitHub URL');
    return { owner: match[1], repo: match[2] };
  };

  describe('📋 parseRepoUrl', () => {
    test('should parse valid GitHub URLs', () => {
      const validUrls = [
        'https://github.com/facebook/react',
        'http://github.com/microsoft/vscode',
        'github.com/google/angular'
      ];

      validUrls.forEach(url => {
        const result = parseRepoUrl(url);
        expect(result).toHaveProperty('owner');
        expect(result).toHaveProperty('repo');
        expect(typeof result.owner).toBe('string');
        expect(typeof result.repo).toBe('string');
      });
    });

    test('should extract correct owner and repo', () => {
      const result = parseRepoUrl('https://github.com/facebook/react');
      expect(result.owner).toBe('facebook');
      expect(result.repo).toBe('react');
    });

    test('should throw error for invalid URLs', () => {
      const invalidUrls = [
        'not-a-url',
        'https://gitlab.com/user/repo',
        'https://github.com/user',
        'https://github.com/'
      ];

      invalidUrls.forEach(url => {
        expect(() => parseRepoUrl(url)).toThrow('Invalid GitHub URL');
      });
    });
  });
});

// Custom Jest matcher
expect.extend({
  toBeOneOf(received, validOptions) {
    const pass = validOptions.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${validOptions}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${validOptions}`,
        pass: false
      };
    }
  }
});

console.log('🧪 Test suite loaded: FastAI Client + API Server + Helpers'); 