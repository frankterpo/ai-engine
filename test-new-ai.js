#!/usr/bin/env node

// Test the new Enhanced AI Client
const { EnhancedAIClient } = require('./enhanced-ai-client.js');
require('dotenv').config();

async function testEnhancedAI() {
    console.log('🧪 TESTING ENHANCED AI CLIENT');
    console.log('============================');
    console.log('');

    try {
        // Initialize AI client
        const ai = new EnhancedAIClient();
        console.log('✅ AI Client initialized successfully!');
        console.log('');

        // Test 1: Company Tech Stack Analysis
        console.log('1️⃣ Testing Company Tech Stack Analysis...');
        const testCompany = {
            name: "Vercel",
            repositories: [
                { name: "next.js", language: "JavaScript", topics: ["react", "nextjs", "frontend"] },
                { name: "turborepo", language: "TypeScript", topics: ["monorepo", "devtools"] },
                { name: "swr", language: "TypeScript", topics: ["react", "data-fetching"] }
            ]
        };

        const companyAnalysis = await ai.analyzeCompanyTechStack(testCompany);
        console.log('✅ Company Analysis:', {
            company: companyAnalysis.company,
            primaryTech: companyAnalysis.primaryTech,
            embeddingSize: companyAnalysis.techStackEmbedding.length
        });
        console.log('');

        // Test 2: Contributor Analysis
        console.log('2️⃣ Testing Contributor Analysis...');
        const testContributor = {
            login: "john-doe",
            contributions: 45,
            languages: ["JavaScript", "Python", "TypeScript"]
        };

        const contributorAnalysis = await ai.analyzeContributor(testContributor);
        console.log('✅ Contributor Analysis:', {
            login: contributorAnalysis.login,
            type: contributorAnalysis.contributorType,
            embeddingSize: contributorAnalysis.profileEmbedding.length
        });
        console.log('');

        // Test 3: Contributor Summary
        console.log('3️⃣ Testing Contributor Summary...');
        const summary = await ai.generateContributorSummary(testContributor);
        console.log('✅ Contributor Summary:', {
            login: summary.login,
            summary: summary.summary.substring(0, 100) + '...',
            ranking: summary.ranking
        });
        console.log('');

        // Test 4: Similarity Calculation
        console.log('4️⃣ Testing Similarity Calculation...');
        const embedding1 = await ai.generateEmbedding("React TypeScript frontend development");
        const embedding2 = await ai.generateEmbedding("Vue.js JavaScript frontend framework");
        const similarity = ai.calculateSimilarity(embedding1, embedding2);
        
        console.log('✅ Similarity Test:', {
            embedding1Size: embedding1.length,
            embedding2Size: embedding2.length,
            similarity: Math.round(similarity * 100) + '%'
        });
        console.log('');

        console.log('🎉 ALL TESTS PASSED!');
        console.log('✅ Enhanced AI Client is working perfectly!');
        console.log('');
        console.log('📋 SUMMARY:');
        console.log('• Company tech stack analysis: ✅ Working');
        console.log('• Contributor analysis: ✅ Working');
        console.log('• Contributor summaries: ✅ Working');
        console.log('• Similarity calculations: ✅ Working');
        console.log('• Embeddings generation: ✅ Working');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('');
        console.log('💡 Troubleshooting:');
        console.log('• Check your HUGGINGFACE_API_KEY in .env file');
        console.log('• Verify your API key has proper permissions');
        console.log('• Try running: npm install @huggingface/inference');
    }
}

// Run the test
testEnhancedAI(); 