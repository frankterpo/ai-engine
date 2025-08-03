#!/usr/bin/env python3
"""
🤗 Hugging Face GPU Server for Company & Repository Analysis
Optimized for L40S GPU with company profile similarity focus
"""

import os
import asyncio
import logging
from typing import List, Dict, Any, Optional
import torch
from transformers import (
    AutoTokenizer, AutoModel, AutoModelForSequenceClassification,
    pipeline, AutoConfig
)
from sentence_transformers import SentenceTransformer
import numpy as np
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import uvicorn
from datetime import datetime
import json

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Check GPU availability
if torch.cuda.is_available():
    device = torch.device("cuda")
    logger.info(f"🚀 GPU Available: {torch.cuda.get_device_name()}")
    logger.info(f"🔥 GPU Memory: {torch.cuda.get_device_properties(0).total_memory // 1024**3} GB")
else:
    device = torch.device("cpu")
    logger.warning("⚠️  Using CPU - GPU not available")

app = FastAPI(
    title="🤗 Hugging Face GPU Repository & Company Analysis",
    description="AI-powered company profile and repository similarity analysis",
    version="2.0.0"
)

# Pydantic models
class RepositoryData(BaseModel):
    owner: str
    name: str
    full_name: str
    description: Optional[str] = None
    language: Optional[str] = None
    topics: List[str] = []
    stars: int = 0
    forks: int = 0
    readme_content: Optional[str] = None
    dependencies: List[str] = []

class CompanyProfileRequest(BaseModel):
    github_username: str
    repos: List[RepositoryData] = []
    analyze_repos: bool = True

class SimilarityRequest(BaseModel):
    repo_data: RepositoryData
    compare_companies: bool = True
    limit: int = 10

class CompanyProfile(BaseModel):
    username: str
    repositories: List[RepositoryData]
    tech_stack: List[str]
    primary_languages: Dict[str, int]
    total_stars: int
    total_forks: int
    profile_embedding: List[float]
    company_type: str
    focus_areas: List[str]

# Global models (will be loaded on startup)
models = {}

@app.on_event("startup")
async def load_models():
    """Load Hugging Face models optimized for company analysis"""
    logger.info("🚀 Loading Hugging Face models...")
    
    try:
        # Sentence transformer for embeddings
        models['sentence_transformer'] = SentenceTransformer(
            'sentence-transformers/all-MiniLM-L6-v2'
        ).to(device)
        logger.info("✅ Sentence Transformer loaded")
        
        # Text classification for company type detection
        models['classifier'] = pipeline(
            "text-classification",
            model="microsoft/DialoGPT-medium",
            device=0 if torch.cuda.is_available() else -1
        )
        logger.info("✅ Company classifier loaded")
        
        # Technology stack classifier
        models['tech_classifier'] = pipeline(
            "zero-shot-classification",
            model="facebook/bart-large-mnli",
            device=0 if torch.cuda.is_available() else -1
        )
        logger.info("✅ Tech stack classifier loaded")
        
        # Similarity model for company matching
        models['similarity_model'] = SentenceTransformer(
            'sentence-transformers/all-mpnet-base-v2'
        ).to(device)
        logger.info("✅ Company similarity model loaded")
        
        logger.info("🎉 All models loaded successfully!")
        
    except Exception as e:
        logger.error(f"❌ Error loading models: {e}")
        raise e

@app.get("/health")
async def health_check():
    """Health check with GPU and model status"""
    gpu_info = {}
    if torch.cuda.is_available():
        gpu_info = {
            "gpu_available": True,
            "gpu_name": torch.cuda.get_device_name(),
            "gpu_memory_total": f"{torch.cuda.get_device_properties(0).total_memory // 1024**3} GB",
            "gpu_memory_used": f"{torch.cuda.memory_allocated() // 1024**2} MB"
        }
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "models_loaded": len(models),
        "device": str(device),
        **gpu_info
    }

@app.post("/analyze_company_profile")
async def analyze_company_profile(request: CompanyProfileRequest):
    """Analyze a GitHub company profile and extract key characteristics"""
    
    try:
        logger.info(f"🏢 Analyzing company profile: {request.github_username}")
        
        # Extract company characteristics
        tech_stack = set()
        languages = {}
        total_stars = 0
        total_forks = 0
        
        # Process repositories
        repo_descriptions = []
        for repo in request.repos:
            if repo.language:
                languages[repo.language] = languages.get(repo.language, 0) + 1
            
            total_stars += repo.stars
            total_forks += repo.forks
            
            # Extract tech stack from topics and dependencies
            tech_stack.update(repo.topics)
            tech_stack.update(repo.dependencies)
            
            # Collect descriptions for analysis
            if repo.description:
                repo_descriptions.append(f"{repo.name}: {repo.description}")
        
        # Create company profile text for embedding
        profile_text = f"""
        Company: {request.github_username}
        Primary Languages: {', '.join(languages.keys())}
        Tech Stack: {', '.join(list(tech_stack)[:20])}
        Repository Focus: {' | '.join(repo_descriptions[:10])}
        Scale: {total_stars} stars, {total_forks} forks across {len(request.repos)} repositories
        """
        
        # Generate profile embedding
        profile_embedding = models['sentence_transformer'].encode(
            profile_text, convert_to_tensor=True
        ).cpu().numpy().tolist()
        
        # Classify company type
        company_types = [
            "Enterprise Software", "Open Source", "AI/ML Company", 
            "Web Development", "Mobile Development", "DevTools",
            "E-commerce", "Fintech", "Gaming", "Cloud Infrastructure"
        ]
        
        classification_result = models['tech_classifier'](
            profile_text, company_types
        )
        
        company_type = classification_result['labels'][0]
        focus_areas = classification_result['labels'][:3]
        
        # Create company profile
        company_profile = CompanyProfile(
            username=request.github_username,
            repositories=request.repos,
            tech_stack=list(tech_stack)[:20],
            primary_languages=languages,
            total_stars=total_stars,
            total_forks=total_forks,
            profile_embedding=profile_embedding,
            company_type=company_type,
            focus_areas=focus_areas
        )
        
        logger.info(f"✅ Company profile analyzed: {company_type}")
        
        return {
            "success": True,
            "profile": company_profile.dict(),
            "analysis_timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Error analyzing company profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/find_similar_companies")
async def find_similar_companies(request: SimilarityRequest):
    """Find companies similar to the given repository/company"""
    
    try:
        logger.info(f"🔍 Finding similar companies for: {request.repo_data.full_name}")
        
        # Create repository profile text
        repo_text = f"""
        Repository: {request.repo_data.name}
        Owner: {request.repo_data.owner}
        Description: {request.repo_data.description or 'No description'}
        Language: {request.repo_data.language or 'Unknown'}
        Topics: {', '.join(request.repo_data.topics)}
        Scale: {request.repo_data.stars} stars, {request.repo_data.forks} forks
        Dependencies: {', '.join(request.repo_data.dependencies[:10])}
        """
        
        # Generate embedding for the input repository
        repo_embedding = models['similarity_model'].encode(
            repo_text, convert_to_tensor=True
        ).cpu().numpy()
        
        # For demonstration, we'll simulate similar companies
        # In production, this would query a database of company profiles
        similar_companies = [
            {
                "company": request.repo_data.owner,
                "similarity_score": 1.0,
                "reasoning": "Exact match - same owner",
                "tech_overlap": request.repo_data.topics,
                "language_match": True
            }
        ]
        
        # Simulate finding similar tech stacks
        if request.repo_data.language == "JavaScript":
            similar_companies.extend([
                {
                    "company": "vercel",
                    "similarity_score": 0.85,
                    "reasoning": "Both focus on JavaScript/TypeScript web development",
                    "tech_overlap": ["javascript", "react", "nextjs"],
                    "language_match": True
                },
                {
                    "company": "airbnb", 
                    "similarity_score": 0.78,
                    "reasoning": "JavaScript-focused with strong engineering practices",
                    "tech_overlap": ["javascript", "react", "style-guide"],
                    "language_match": True
                }
            ])
        
        if request.repo_data.language == "TypeScript":
            similar_companies.extend([
                {
                    "company": "microsoft",
                    "similarity_score": 0.92,
                    "reasoning": "TypeScript creators with extensive developer tools",
                    "tech_overlap": ["typescript", "vscode", "developer-tools"],
                    "language_match": True
                }
            ])
        
        logger.info(f"✅ Found {len(similar_companies)} similar companies")
        
        return {
            "success": True,
            "query_repo": request.repo_data.dict(),
            "similar_companies": similar_companies[:request.limit],
            "analysis_timestamp": datetime.utcnow().isoformat(),
            "embedding_dimensions": len(repo_embedding)
        }
        
    except Exception as e:
        logger.error(f"❌ Error finding similar companies: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze_repository")
async def analyze_repository(repo_data: RepositoryData):
    """Analyze a single repository with Hugging Face models"""
    
    try:
        logger.info(f"📊 Analyzing repository: {repo_data.full_name}")
        
        # Create comprehensive text for analysis
        analysis_text = f"""
        {repo_data.name}
        {repo_data.description or ''}
        Language: {repo_data.language or 'Unknown'}
        Topics: {' '.join(repo_data.topics)}
        README: {(repo_data.readme_content or '')[:1000]}
        """
        
        # Generate embedding
        embedding = models['sentence_transformer'].encode(
            analysis_text, convert_to_tensor=True
        ).cpu().numpy().tolist()
        
        # Classify technology domain
        tech_domains = [
            "Web Development", "Mobile Development", "AI/Machine Learning",
            "DevOps/Infrastructure", "Desktop Applications", "Game Development",
            "Data Science", "Blockchain", "IoT", "Security"
        ]
        
        domain_classification = models['tech_classifier'](
            analysis_text, tech_domains
        )
        
        # Extract architecture patterns
        architecture_patterns = []
        if any(topic in repo_data.topics for topic in ['react', 'vue', 'angular']):
            architecture_patterns.append("Frontend Framework")
        if any(topic in repo_data.topics for topic in ['api', 'backend', 'server']):
            architecture_patterns.append("Backend Service")
        if repo_data.language in ['Python', 'R', 'Julia']:
            architecture_patterns.append("Data Processing")
        
        analysis_result = {
            "repository": repo_data.dict(),
            "embedding": embedding,
            "primary_domain": domain_classification['labels'][0],
            "domain_confidence": domain_classification['scores'][0],
            "all_domains": list(zip(domain_classification['labels'], domain_classification['scores'])),
            "architecture_patterns": architecture_patterns,
            "embedding_dimensions": len(embedding),
            "analysis_timestamp": datetime.utcnow().isoformat()
        }
        
        logger.info(f"✅ Repository analyzed: {domain_classification['labels'][0]}")
        
        return {
            "success": True,
            "analysis": analysis_result
        }
        
    except Exception as e:
        logger.error(f"❌ Error analyzing repository: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models/status")
async def models_status():
    """Get status of loaded models"""
    model_info = {}
    for name, model in models.items():
        model_info[name] = {
            "loaded": True,
            "device": str(getattr(model, 'device', 'unknown')),
            "type": type(model).__name__
        }
    
    return {
        "models": model_info,
        "total_models": len(models),
        "gpu_available": torch.cuda.is_available(),
        "current_device": str(device)
    }

if __name__ == "__main__":
    logger.info("🚀 Starting Hugging Face GPU Server...")
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000, 
        workers=1,
        log_level="info"
    ) 