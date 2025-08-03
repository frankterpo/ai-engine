#!/usr/bin/env python3
"""
Enhanced GPU Server for AI Repository Analysis
Integrates with PostgreSQL for caching and batch processing
Maximizes L40S GPU utilization with queue-based processing
"""

import os
import asyncio
import logging
import json
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
import uuid

import torch
import numpy as np
from transformers import AutoTokenizer, AutoModel
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

import asyncpg
import psycopg2
from psycopg2.extras import RealDictCursor, Json
import aioredis

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# GPU and device setup
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info(f"Using device: {device}")

if torch.cuda.is_available():
    gpu_name = torch.cuda.get_device_name(0)
    gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
    logger.info(f"GPU: {gpu_name}, Memory: {gpu_memory:.2f}GB")

# FastAPI app
app = FastAPI(
    title="AI-Enhanced GPU Repository Analysis Server",
    description="High-performance GPU server with PostgreSQL caching",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global models
sentence_model = None
codebert_model = None
codebert_tokenizer = None

# Database connection pool
db_pool = None
redis_client = None

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/repo_cache")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "32"))
MAX_QUEUE_SIZE = int(os.getenv("MAX_QUEUE_SIZE", "1000"))

# Pydantic models
class EmbeddingRequest(BaseModel):
    text: str
    model_type: str = "sentence_transformer"

class BatchEmbeddingRequest(BaseModel):
    texts: List[str]
    model_type: str = "sentence_transformer"
    repository_ids: Optional[List[str]] = None

class RepositoryAnalysisRequest(BaseModel):
    repository_data: Dict[str, Any]
    full_analysis: bool = True
    priority: int = 5

class SimilarityRequest(BaseModel):
    embedding1: List[float]
    embedding2: List[float]

class QueueStatusResponse(BaseModel):
    pending_tasks: int
    processing_tasks: int
    completed_today: int
    gpu_utilization: float

# Database functions
async def init_database():
    """Initialize database connection pool"""
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=5,
            max_size=20,
            command_timeout=60
        )
        logger.info("Database connection pool initialized")
        
        # Test connection and run migrations if needed
        async with db_pool.acquire() as conn:
            # Check if tables exist
            result = await conn.fetchval(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'repositories')"
            )
            if not result:
                logger.warning("Database tables not found. Please run schema.sql first.")
                
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        db_pool = None

async def init_redis():
    """Initialize Redis connection"""
    global redis_client
    try:
        redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
        await redis_client.ping()
        logger.info("Redis connection initialized")
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}")
        redis_client = None

async def get_repository_by_full_name(full_name: str) -> Optional[Dict]:
    """Get repository from database by full name"""
    if not db_pool:
        return None
        
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM repositories WHERE full_name = $1",
            full_name
        )
        return dict(row) if row else None

async def save_repository(repo_data: Dict) -> str:
    """Save repository to database, return UUID"""
    if not db_pool:
        return str(uuid.uuid4())
        
    async with db_pool.acquire() as conn:
        # Upsert repository
        repo_id = await conn.fetchval("""
            INSERT INTO repositories (
                full_name, owner, name, description, language, topics,
                stars, forks, created_at, updated_at, api_data, readme_content
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        """,
            repo_data.get('full_name'),
            repo_data.get('owner', {}).get('login') if isinstance(repo_data.get('owner'), dict) else repo_data.get('owner'),
            repo_data.get('name'),
            repo_data.get('description'),
            repo_data.get('language'),
            repo_data.get('topics', []),
            repo_data.get('stargazers_count', 0),
            repo_data.get('forks_count', 0),
            repo_data.get('created_at'),
            repo_data.get('updated_at'),
            Json(repo_data),
            repo_data.get('readme_content')
        )
        
        return str(repo_id)

async def save_embedding(repo_id: str, embedding: List[float], model_name: str, input_text: str):
    """Save embedding to database"""
    if not db_pool:
        return
        
    async with db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO embeddings (repository_id, embedding_type, model_name, embedding, input_text)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (repository_id, embedding_type, model_name)
            DO UPDATE SET embedding = EXCLUDED.embedding, input_text = EXCLUDED.input_text
        """, repo_id, "sentence_transformer", model_name, embedding, input_text)

async def get_cached_embedding(repo_id: str, model_name: str) -> Optional[List[float]]:
    """Get cached embedding from database"""
    if not db_pool:
        return None
        
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT embedding FROM embeddings 
            WHERE repository_id = $1 AND model_name = $2
        """, repo_id, model_name)
        
        return list(row['embedding']) if row else None

async def add_to_processing_queue(repo_id: str, task_type: str, priority: int = 5):
    """Add task to processing queue"""
    if not db_pool:
        return
        
    async with db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO processing_queue (repository_id, task_type, priority)
            VALUES ($1, $2, $3)
            ON CONFLICT (repository_id, task_type) DO NOTHING
        """, repo_id, task_type, priority)

async def get_next_batch_tasks(task_type: str, batch_size: int = BATCH_SIZE) -> List[Dict]:
    """Get next batch of tasks from processing queue"""
    if not db_pool:
        return []
        
    async with db_pool.acquire() as conn:
        # Mark tasks as processing and return them
        rows = await conn.fetch("""
            UPDATE processing_queue 
            SET status = 'processing', 
                processing_started_at = CURRENT_TIMESTAMP,
                attempts = attempts + 1
            WHERE id IN (
                SELECT id FROM processing_queue 
                WHERE status = 'pending' AND task_type = $1
                ORDER BY priority DESC, created_at ASC
                LIMIT $2
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id, repository_id, task_type, priority
        """, task_type, batch_size)
        
        return [dict(row) for row in rows]

async def mark_task_completed(task_id: str, error_message: Optional[str] = None):
    """Mark task as completed or failed"""
    if not db_pool:
        return
        
    status = 'failed' if error_message else 'completed'
    
    async with db_pool.acquire() as conn:
        await conn.execute("""
            UPDATE processing_queue 
            SET status = $1, 
                processing_completed_at = CURRENT_TIMESTAMP,
                error_message = $2
            WHERE id = $3
        """, status, error_message, task_id)

# Model loading
async def load_models():
    """Load AI models on startup"""
    global sentence_model, codebert_model, codebert_tokenizer
    
    try:
        logger.info("Loading SentenceTransformer model...")
        sentence_model = SentenceTransformer('all-MiniLM-L6-v2')
        sentence_model = sentence_model.to(device)
        logger.info("SentenceTransformer loaded successfully")
        
        logger.info("Loading CodeBERT model...")
        codebert_tokenizer = AutoTokenizer.from_pretrained('microsoft/codebert-base')
        codebert_model = AutoModel.from_pretrained('microsoft/codebert-base')
        codebert_model = codebert_model.to(device)
        codebert_model.eval()
        logger.info("CodeBERT loaded successfully")
        
        # Warm up models with dummy data
        logger.info("Warming up models...")
        dummy_text = "This is a dummy text for model warmup"
        _ = sentence_model.encode([dummy_text])
        logger.info("Models warmed up successfully")
        
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
        raise

# Embedding functions
def generate_sentence_embedding(texts: List[str]) -> np.ndarray:
    """Generate embeddings using SentenceTransformer"""
    if sentence_model is None:
        raise HTTPException(status_code=500, detail="SentenceTransformer model not loaded")
    
    try:
        with torch.no_grad():
            embeddings = sentence_model.encode(
                texts, 
                batch_size=min(len(texts), BATCH_SIZE),
                convert_to_tensor=True,
                device=device
            )
            return embeddings.cpu().numpy()
    except Exception as e:
        logger.error(f"Error generating sentence embeddings: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(e)}")

def generate_code_embedding(texts: List[str]) -> np.ndarray:
    """Generate embeddings using CodeBERT"""
    if codebert_model is None or codebert_tokenizer is None:
        raise HTTPException(status_code=500, detail="CodeBERT model not loaded")
    
    try:
        embeddings = []
        
        with torch.no_grad():
            for text in texts:
                inputs = codebert_tokenizer(
                    text, 
                    padding=True, 
                    truncation=True, 
                    max_length=512, 
                    return_tensors="pt"
                ).to(device)
                
                outputs = codebert_model(**inputs)
                # Use CLS token embedding
                embedding = outputs.last_hidden_state[:, 0, :].cpu().numpy()
                embeddings.append(embedding[0])
        
        return np.array(embeddings)
        
    except Exception as e:
        logger.error(f"Error generating code embeddings: {e}")
        raise HTTPException(status_code=500, detail=f"Code embedding generation failed: {str(e)}")

# Background processing
async def process_embedding_queue():
    """Background task to process embedding queue"""
    while True:
        try:
            tasks = await get_next_batch_tasks('embedding', BATCH_SIZE)
            
            if not tasks:
                await asyncio.sleep(5)  # Wait 5 seconds if no tasks
                continue
                
            logger.info(f"Processing {len(tasks)} embedding tasks")
            
            # Get repository data for all tasks
            repo_ids = [task['repository_id'] for task in tasks]
            
            if db_pool:
                async with db_pool.acquire() as conn:
                    rows = await conn.fetch("""
                        SELECT id, full_name, description, readme_content 
                        FROM repositories 
                        WHERE id = ANY($1)
                    """, repo_ids)
                    
                    repo_data = {str(row['id']): dict(row) for row in rows}
            else:
                continue
            
            # Prepare texts for batch embedding
            texts = []
            task_repo_mapping = []
            
            for task in tasks:
                repo_id = task['repository_id']
                if repo_id in repo_data:
                    repo = repo_data[repo_id]
                    # Create embedding text
                    text_parts = [
                        repo.get('full_name', ''),
                        repo.get('description', ''),
                        repo.get('readme_content', '')[:1000] if repo.get('readme_content') else ''
                    ]
                    text = ' '.join(filter(None, text_parts))
                    texts.append(text)
                    task_repo_mapping.append((task, repo_id, text))
            
            if texts:
                # Generate embeddings in batch
                embeddings = generate_sentence_embedding(texts)
                
                # Save embeddings to database
                for i, (task, repo_id, text) in enumerate(task_repo_mapping):
                    try:
                        embedding = embeddings[i].tolist()
                        await save_embedding(repo_id, embedding, "all-MiniLM-L6-v2", text)
                        await mark_task_completed(task['id'])
                        logger.info(f"Completed embedding for repository {repo_id}")
                    except Exception as e:
                        await mark_task_completed(task['id'], str(e))
                        logger.error(f"Failed to save embedding for {repo_id}: {e}")
            
        except Exception as e:
            logger.error(f"Error in embedding queue processing: {e}")
            await asyncio.sleep(10)  # Wait longer on error

# API endpoints
@app.on_event("startup")
async def startup_event():
    """Initialize everything on startup"""
    logger.info("Starting AI-Enhanced GPU Server...")
    
    await load_models()
    await init_database()
    await init_redis()
    
    # Start background processing
    asyncio.create_task(process_embedding_queue())
    
    logger.info("Server startup complete!")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    gpu_available = torch.cuda.is_available()
    gpu_memory = None
    gpu_utilization = None
    
    if gpu_available:
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
        # Simple GPU utilization check
        try:
            torch.cuda.empty_cache()
            gpu_utilization = torch.cuda.memory_allocated() / torch.cuda.max_memory_allocated() * 100
        except:
            gpu_utilization = 0
    
    db_status = "connected" if db_pool else "disconnected"
    redis_status = "connected" if redis_client else "disconnected"
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "gpu": {
            "available": gpu_available,
            "memory_gb": gpu_memory,
            "utilization_percent": gpu_utilization
        },
        "database": db_status,
        "redis": redis_status,
        "models": {
            "sentence_transformer": sentence_model is not None,
            "codebert": codebert_model is not None
        }
    }

@app.post("/embed")
async def generate_embedding(request: EmbeddingRequest):
    """Generate single embedding"""
    try:
        if request.model_type == "sentence_transformer":
            embeddings = generate_sentence_embedding([request.text])
            return {
                "embedding": embeddings[0].tolist(),
                "model": "all-MiniLM-L6-v2",
                "dimensions": len(embeddings[0])
            }
        elif request.model_type == "codebert":
            embeddings = generate_code_embedding([request.text])
            return {
                "embedding": embeddings[0].tolist(),
                "model": "microsoft/codebert-base",
                "dimensions": len(embeddings[0])
            }
        else:
            raise HTTPException(status_code=400, detail="Unsupported model type")
            
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/embed_batch")
async def generate_batch_embeddings(request: BatchEmbeddingRequest):
    """Generate batch embeddings with caching"""
    try:
        if request.model_type == "sentence_transformer":
            embeddings = generate_sentence_embedding(request.texts)
            
            # Save to database if repository IDs provided
            if request.repository_ids and len(request.repository_ids) == len(request.texts):
                for i, repo_id in enumerate(request.repository_ids):
                    await save_embedding(
                        repo_id, 
                        embeddings[i].tolist(), 
                        "all-MiniLM-L6-v2", 
                        request.texts[i]
                    )
            
            return {
                "embeddings": [emb.tolist() for emb in embeddings],
                "model": "all-MiniLM-L6-v2",
                "count": len(embeddings),
                "dimensions": len(embeddings[0]) if len(embeddings) > 0 else 0
            }
        else:
            raise HTTPException(status_code=400, detail="Unsupported model type")
            
    except Exception as e:
        logger.error(f"Batch embedding generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze_repository")
async def analyze_repository(request: RepositoryAnalysisRequest, background_tasks: BackgroundTasks):
    """Analyze repository and add to processing queue"""
    try:
        repo_data = request.repository_data
        
        # Save repository to database
        repo_id = await save_repository(repo_data)
        
        # Add analysis tasks to queue
        if request.full_analysis:
            await add_to_processing_queue(repo_id, 'embedding', request.priority)
            await add_to_processing_queue(repo_id, 'classification', request.priority)
            await add_to_processing_queue(repo_id, 'sentiment', request.priority)
        else:
            await add_to_processing_queue(repo_id, 'embedding', request.priority)
        
        return {
            "repository_id": repo_id,
            "full_name": repo_data.get('full_name'),
            "queued_for_analysis": True,
            "priority": request.priority
        }
        
    except Exception as e:
        logger.error(f"Repository analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/queue_status")
async def get_queue_status() -> QueueStatusResponse:
    """Get processing queue status"""
    if not db_pool:
        return QueueStatusResponse(
            pending_tasks=0,
            processing_tasks=0,
            completed_today=0,
            gpu_utilization=0.0
        )
    
    async with db_pool.acquire() as conn:
        # Get queue statistics
        pending = await conn.fetchval(
            "SELECT COUNT(*) FROM processing_queue WHERE status = 'pending'"
        )
        processing = await conn.fetchval(
            "SELECT COUNT(*) FROM processing_queue WHERE status = 'processing'"
        )
        completed_today = await conn.fetchval(
            "SELECT COUNT(*) FROM processing_queue WHERE status = 'completed' AND processing_completed_at >= CURRENT_DATE"
        )
    
    # Get GPU utilization
    gpu_util = 0.0
    if torch.cuda.is_available():
        try:
            gpu_util = torch.cuda.memory_allocated() / torch.cuda.max_memory_allocated() * 100
        except:
            gpu_util = 0.0
    
    return QueueStatusResponse(
        pending_tasks=pending,
        processing_tasks=processing,
        completed_today=completed_today,
        gpu_utilization=gpu_util
    )

@app.post("/similarity")
async def calculate_similarity(request: SimilarityRequest):
    """Calculate cosine similarity between two embeddings"""
    try:
        emb1 = np.array(request.embedding1).reshape(1, -1)
        emb2 = np.array(request.embedding2).reshape(1, -1)
        
        similarity = cosine_similarity(emb1, emb2)[0][0]
        
        return {
            "similarity": float(similarity),
            "distance": float(1 - similarity)
        }
        
    except Exception as e:
        logger.error(f"Similarity calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stats")
async def get_stats():
    """Get server statistics"""
    stats = {
        "server": {
            "uptime_hours": 0,  # Would need to track startup time
            "requests_processed": 0,  # Would need to track
        },
        "gpu": {
            "available": torch.cuda.is_available(),
            "memory_used_gb": 0,
            "memory_total_gb": 0
        },
        "database": {
            "connected": db_pool is not None,
            "pool_size": db_pool.get_size() if db_pool else 0
        },
        "models": {
            "sentence_transformer_loaded": sentence_model is not None,
            "codebert_loaded": codebert_model is not None
        }
    }
    
    if torch.cuda.is_available():
        stats["gpu"]["memory_used_gb"] = torch.cuda.memory_allocated() / 1024**3
        stats["gpu"]["memory_total_gb"] = torch.cuda.get_device_properties(0).total_memory / 1024**3
    
    return stats

if __name__ == "__main__":
    # Run the server
    uvicorn.run(
        "gpu-server-enhanced:app",
        host="0.0.0.0",
        port=8000,
        workers=1,
        loop="asyncio"
    ) 