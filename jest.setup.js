#!/usr/bin/env node

// 🧪 Jest Global Setup
// Handles test environment configuration and cleanup

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for tests

// Increase timeout for async operations
jest.setTimeout(10000);

// Mock console methods in test environment to reduce noise
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Suppress logs during testing unless specifically needed
  if (!process.env.VERBOSE_TESTS) {
    console.log = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  // Restore original console methods
  if (!process.env.VERBOSE_TESTS) {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
});

// Global test utilities
global.testUtils = {
  // Helper to wait for async operations
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to create mock responses
  mockGitHubResponse: (overrides = {}) => ({
    name: 'test-repo',
    full_name: 'test-user/test-repo',
    description: 'A test repository',
    language: 'JavaScript',
    topics: ['test', 'javascript'],
    stargazers_count: 100,
    forks_count: 20,
    html_url: 'https://github.com/test-user/test-repo',
    ...overrides
  }),
  
  // Helper to create mock contributors
  mockContributors: () => [
    {
      login: 'test-user1',
      contributions: 50,
      avatar_url: 'https://avatars.githubusercontent.com/u/1',
      html_url: 'https://github.com/test-user1'
    },
    {
      login: 'test-user2', 
      contributions: 30,
      avatar_url: 'https://avatars.githubusercontent.com/u/2',
      html_url: 'https://github.com/test-user2'
    }
  ]
};

console.log('🧪 Jest setup complete - Test environment configured'); 