#!/usr/bin/env python3
"""
🤗 AutoTrain Setup for Company Similarity Models
Trains custom AI models using your L40S GPU via Hugging Face Spaces
"""

import os
import json
import requests
from pathlib import Path

# Configuration
HF_USERNAME = os.environ.get("HF_USERNAME", "your-username")
HF_TOKEN = os.environ.get("HF_TOKEN", "hf_xxxxxxxxxxxxxxxxxxxx")
AUTOTRAIN_API_BASE = "http://127.0.0.1:8000"

def create_company_classification_project():
    """Create a project to train a company type classifier"""
    
    project_config = {
        "username": HF_USERNAME,
        "project_name": "company-classifier-v1",
        "task": "text_classification",
        "base_model": "microsoft/mpnet-base",
        "hub_dataset": f"{HF_USERNAME}/github-companies-classification",
        "train_split": "train",
        "hardware": "spaces-l40sx1",  # Your L40S GPU
        "column_mapping": {
            "text_column": "company_description",
            "target_column": "company_type"
        },
        "params": {
            "epochs": 3,
            "batch_size": 16,
            "lr": 2e-5,
            "max_seq_length": 256,
            "mixed_precision": "fp16",
            "optimizer": "adamw_torch",
            "scheduler": "linear",
            "warmup_ratio": 0.1
        }
    }
    
    return project_config

def create_similarity_embedding_project():
    """Create a project to train sentence transformers for company similarity"""
    
    project_config = {
        "username": HF_USERNAME,
        "project_name": "company-similarity-embeddings-v1",
        "task": "sentence_transformers",
        "base_model": "sentence-transformers/all-mpnet-base-v2",
        "hub_dataset": f"{HF_USERNAME}/github-companies-similarity-pairs",
        "train_split": "train",
        "hardware": "spaces-l40sx1",  # Your L40S GPU
        "column_mapping": {
            "sentence1_column": "company1_description",
            "sentence2_column": "company2_description",
            "target_column": "similarity_score"
        },
        "params": {
            "epochs": 3,
            "batch_size": 8,
            "lr": 2e-5,
            "max_seq_length": 512,
            "mixed_precision": "fp16",
            "trainer": "pair_score"
        }
    }
    
    return project_config

def create_autotrain_project(project_config):
    """Submit a project to AutoTrain API"""
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {HF_TOKEN}"
    }
    
    response = requests.post(
        f"{AUTOTRAIN_API_BASE}/api/create_project",
        headers=headers,
        json=project_config
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Project created: {result.get('project_id')}")
        print(f"🔗 Space URL: {result.get('space_url')}")
        return result
    else:
        print(f"❌ Error creating project: {response.text}")
        return None

def generate_training_data():
    """Generate training datasets from your existing GitHub company data"""
    
    print("📊 Generating training data from your API results...")
    
    # Company classification data
    classification_data = []
    
    # Sample companies with their types (you'd expand this with real data)
    sample_companies = [
        {
            "company_name": "vercel",
            "company_description": "Develop. Preview. Ship. Creators of Next.js. Focus on TypeScript, React, NextJS frameworks and developer tools.",
            "company_type": "Web Development",
            "tech_stack": ["TypeScript", "React", "NextJS", "Svelte"],
            "total_stars": 2494
        },
        {
            "company_name": "facebook", 
            "company_description": "React library creators. Focus on JavaScript, declarative UI, frontend frameworks and social platform technology.",
            "company_type": "Frontend Framework",
            "tech_stack": ["JavaScript", "React", "PHP", "Python"],
            "total_stars": 237813
        },
        {
            "company_name": "microsoft",
            "company_description": "TypeScript creators, Visual Studio Code, extensive developer tools and enterprise software solutions.",
            "company_type": "Developer Tools",
            "tech_stack": ["TypeScript", "C#", "Python", "JavaScript"],
            "total_stars": 500000
        },
        {
            "company_name": "openai",
            "company_description": "Artificial intelligence research and deployment. Machine learning models, API services, and AI tools.",
            "company_type": "AI/ML Company",
            "tech_stack": ["Python", "JavaScript", "AI Models"],
            "total_stars": 100000
        }
    ]
    
    # Generate similarity pairs
    similarity_pairs = []
    for i, company1 in enumerate(sample_companies):
        for company2 in sample_companies[i+1:]:
            # Calculate similarity based on tech stack overlap
            tech_overlap = len(set(company1["tech_stack"]) & set(company2["tech_stack"]))
            type_match = 1.0 if company1["company_type"] == company2["company_type"] else 0.0
            
            similarity_score = (tech_overlap / max(len(company1["tech_stack"]), len(company2["tech_stack"]))) * 0.7 + type_match * 0.3
            
            similarity_pairs.append({
                "company1_description": company1["company_description"],
                "company2_description": company2["company_description"],
                "similarity_score": similarity_score,
                "company1_name": company1["company_name"],
                "company2_name": company2["company_name"]
            })
    
    # Save datasets
    os.makedirs("training_data", exist_ok=True)
    
    with open("training_data/company_classification.json", "w") as f:
        json.dump(sample_companies, f, indent=2)
    
    with open("training_data/company_similarity_pairs.json", "w") as f:
        json.dump(similarity_pairs, f, indent=2)
    
    print(f"✅ Generated {len(sample_companies)} classification samples")
    print(f"✅ Generated {len(similarity_pairs)} similarity pairs")
    print("📁 Saved to training_data/ directory")

def main():
    """Main setup function"""
    
    print("🤗 AutoTrain Setup for Company AI Models")
    print("=" * 50)
    
    # Step 1: Generate training data
    generate_training_data()
    
    print("\n🎯 NEXT STEPS:")
    print("1. Upload training data to Hugging Face Hub as datasets")
    print("2. Start AutoTrain API server: autotrain app --port 8000")
    print("3. Run training projects on your L40S GPU")
    print("4. Integrate trained models back into your API")
    
    print(f"\n📝 UPLOAD COMMANDS:")
    print(f"huggingface-cli upload {HF_USERNAME}/github-companies-classification training_data/company_classification.json")
    print(f"huggingface-cli upload {HF_USERNAME}/github-companies-similarity-pairs training_data/company_similarity_pairs.json")
    
    print("\n🚀 TRAINING PROJECTS:")
    print("• Company Classifier: Categorizes companies (Web Dev, AI/ML, etc.)")
    print("• Similarity Embeddings: Semantic understanding of company relationships")
    print("• Custom models trained on YOUR GitHub data")
    
    # Generate project configs for reference
    classifier_config = create_company_classification_project()
    similarity_config = create_similarity_embedding_project()
    
    with open("autotrain_classifier_config.json", "w") as f:
        json.dump(classifier_config, f, indent=2)
    
    with open("autotrain_similarity_config.json", "w") as f:  
        json.dump(similarity_config, f, indent=2)
    
    print("\n✅ AutoTrain configurations saved!")
    print("📁 autotrain_classifier_config.json")
    print("📁 autotrain_similarity_config.json")

if __name__ == "__main__":
    main() 