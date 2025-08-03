-- PostgreSQL Schema for AI-Enhanced Repository Similarity Cache
-- Optimized for GPU batch processing and fast retrieval

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector"; -- For semantic embeddings (pgvector)

-- Repositories table - core GitHub data
CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) UNIQUE NOT NULL,
    owner VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    language VARCHAR(100),
    topics TEXT[], -- Array of topics
    stars INTEGER DEFAULT 0,
    forks INTEGER DEFAULT 0,
    size_kb INTEGER DEFAULT 0,
    default_branch VARCHAR(100) DEFAULT 'main',
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    pushed_at TIMESTAMP,
    homepage VARCHAR(500),
    license VARCHAR(100),
    is_fork BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    is_private BOOLEAN DEFAULT FALSE,
    has_issues BOOLEAN DEFAULT TRUE,
    has_projects BOOLEAN DEFAULT TRUE,
    has_wiki BOOLEAN DEFAULT TRUE,
    has_pages BOOLEAN DEFAULT FALSE,
    open_issues_count INTEGER DEFAULT 0,
    watchers_count INTEGER DEFAULT 0,
    subscribers_count INTEGER DEFAULT 0,
    network_count INTEGER DEFAULT 0,
    -- Metadata
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_analyzed TIMESTAMP,
    api_data JSONB, -- Full GitHub API response
    readme_content TEXT,
    
    -- Indexes for fast lookups
    CONSTRAINT repositories_full_name_key UNIQUE (full_name)
);

-- Semantic embeddings table - Cohere embeddings
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    embedding_type VARCHAR(50) NOT NULL, -- 'cohere', 'openai', etc.
    model_name VARCHAR(100) NOT NULL, -- 'embed-english-v3.0'
    embedding vector(1024), -- 1024-dimensional vector for Cohere
    input_text TEXT, -- Text that was embedded
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(repository_id, embedding_type, model_name)
);

-- AI Classifications table - Hugging Face results
CREATE TABLE classifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    model_name VARCHAR(100) NOT NULL,
    primary_category VARCHAR(100) NOT NULL,
    confidence FLOAT NOT NULL,
    all_categories JSONB, -- Array of {category, confidence}
    input_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(repository_id, model_name)
);

-- Sentiment Analysis table
CREATE TABLE sentiment_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    model_name VARCHAR(100) NOT NULL,
    sentiment_label VARCHAR(50) NOT NULL, -- POSITIVE, NEGATIVE, NEUTRAL
    confidence FLOAT NOT NULL,
    interpretation TEXT,
    input_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(repository_id, model_name)
);

-- Dependencies table
CREATE TABLE dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    dependency_name VARCHAR(255) NOT NULL,
    version_constraint VARCHAR(100),
    dependency_type VARCHAR(50), -- 'production', 'development', 'peer', etc.
    package_manager VARCHAR(50), -- 'npm', 'pip', 'gem', 'maven', etc.
    file_source VARCHAR(255), -- 'package.json', 'requirements.txt', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(repository_id, dependency_name, dependency_type)
);

-- Contributors table
CREATE TABLE contributors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    github_login VARCHAR(255) NOT NULL,
    github_id INTEGER,
    avatar_url VARCHAR(500),
    html_url VARCHAR(500),
    contributions_count INTEGER DEFAULT 0,
    contribution_type VARCHAR(50) DEFAULT 'commits', -- commits, additions, deletions
    is_owner BOOLEAN DEFAULT FALSE,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(repository_id, github_login)
);

-- Code Patterns table - Architecture detection
CREATE TABLE code_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    pattern_type VARCHAR(100) NOT NULL, -- 'architecture', 'framework', 'pattern'
    pattern_name VARCHAR(255) NOT NULL, -- 'React Architecture', 'Microservices', etc.
    confidence FLOAT DEFAULT 1.0,
    detection_method VARCHAR(100), -- 'dependency_analysis', 'readme_analysis', etc.
    evidence JSONB, -- Supporting evidence
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(repository_id, pattern_type, pattern_name)
);

-- Similarity Scores table - Pre-computed similarity pairs
CREATE TABLE similarity_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repo_a_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    repo_b_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    similarity_type VARCHAR(50) NOT NULL, -- 'semantic', 'topic', 'dependency', etc.
    similarity_score FLOAT NOT NULL,
    calculation_method VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(repo_a_id, repo_b_id, similarity_type),
    CHECK (repo_a_id != repo_b_id),
    CHECK (similarity_score >= 0 AND similarity_score <= 1)
);

-- Search Results Cache table
CREATE TABLE search_results_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    search_query_hash VARCHAR(64) NOT NULL, -- SHA256 of search parameters
    target_repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    search_parameters JSONB NOT NULL, -- Original search parameters
    results JSONB NOT NULL, -- Cached results array
    result_count INTEGER NOT NULL,
    strategies_used TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(search_query_hash)
);

-- Processing Queue table - For GPU batch processing
CREATE TABLE processing_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    task_type VARCHAR(100) NOT NULL, -- 'embedding', 'classification', 'sentiment', etc.
    priority INTEGER DEFAULT 5, -- 1-10, higher is more priority
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    processing_started_at TIMESTAMP,
    processing_completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_processing_queue_status_priority (status, priority DESC, created_at)
);

-- Analytics table - Usage statistics
CREATE TABLE analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL, -- 'search', 'cache_hit', 'gpu_process', etc.
    repository_id UUID REFERENCES repositories(id) ON DELETE SET NULL,
    metadata JSONB,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for optimal performance
CREATE INDEX idx_repositories_full_name ON repositories(full_name);
CREATE INDEX idx_repositories_language ON repositories(language);
CREATE INDEX idx_repositories_stars ON repositories(stars DESC);
CREATE INDEX idx_repositories_updated_at ON repositories(updated_at DESC);
CREATE INDEX idx_repositories_topics ON repositories USING GIN(topics);
CREATE INDEX idx_repositories_last_analyzed ON repositories(last_analyzed) WHERE last_analyzed IS NOT NULL;

CREATE INDEX idx_embeddings_repository_id ON embeddings(repository_id);
CREATE INDEX idx_embeddings_type_model ON embeddings(embedding_type, model_name);

CREATE INDEX idx_classifications_repository_id ON classifications(repository_id);
CREATE INDEX idx_classifications_category ON classifications(primary_category);
CREATE INDEX idx_classifications_confidence ON classifications(confidence DESC);

CREATE INDEX idx_sentiment_repository_id ON sentiment_analysis(repository_id);
CREATE INDEX idx_sentiment_label ON sentiment_analysis(sentiment_label);

CREATE INDEX idx_dependencies_repository_id ON dependencies(repository_id);
CREATE INDEX idx_dependencies_name ON dependencies(dependency_name);
CREATE INDEX idx_dependencies_manager ON dependencies(package_manager);

CREATE INDEX idx_contributors_repository_id ON contributors(repository_id);
CREATE INDEX idx_contributors_login ON contributors(github_login);
CREATE INDEX idx_contributors_contributions ON contributors(contributions_count DESC);

CREATE INDEX idx_code_patterns_repository_id ON code_patterns(repository_id);
CREATE INDEX idx_code_patterns_type ON code_patterns(pattern_type);
CREATE INDEX idx_code_patterns_name ON code_patterns(pattern_name);

CREATE INDEX idx_similarity_scores_repo_a ON similarity_scores(repo_a_id);
CREATE INDEX idx_similarity_scores_repo_b ON similarity_scores(repo_b_id);
CREATE INDEX idx_similarity_scores_type_score ON similarity_scores(similarity_type, similarity_score DESC);

CREATE INDEX idx_search_cache_hash ON search_results_cache(search_query_hash);
CREATE INDEX idx_search_cache_expires ON search_results_cache(expires_at);
CREATE INDEX idx_search_cache_target_repo ON search_results_cache(target_repo_id);

CREATE INDEX idx_processing_queue_status ON processing_queue(status);
CREATE INDEX idx_processing_queue_priority ON processing_queue(priority DESC);
CREATE INDEX idx_processing_queue_repo_task ON processing_queue(repository_id, task_type);

CREATE INDEX idx_analytics_event_type ON analytics(event_type);
CREATE INDEX idx_analytics_created_at ON analytics(created_at DESC);

-- Vector similarity index for semantic search (requires pgvector extension)
CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Views for common queries
CREATE VIEW repository_analysis_status AS
SELECT 
    r.id,
    r.full_name,
    r.language,
    r.stars,
    r.last_analyzed,
    CASE 
        WHEN e.id IS NOT NULL THEN true 
        ELSE false 
    END as has_embedding,
    CASE 
        WHEN c.id IS NOT NULL THEN true 
        ELSE false 
    END as has_classification,
    CASE 
        WHEN s.id IS NOT NULL THEN true 
        ELSE false 
    END as has_sentiment,
    COUNT(d.id) as dependency_count,
    COUNT(ct.id) as contributor_count,
    COUNT(cp.id) as pattern_count
FROM repositories r
LEFT JOIN embeddings e ON r.id = e.repository_id
LEFT JOIN classifications c ON r.id = c.repository_id  
LEFT JOIN sentiment_analysis s ON r.id = s.repository_id
LEFT JOIN dependencies d ON r.id = d.repository_id
LEFT JOIN contributors ct ON r.id = ct.repository_id
LEFT JOIN code_patterns cp ON r.id = cp.repository_id
GROUP BY r.id, r.full_name, r.language, r.stars, r.last_analyzed, e.id, c.id, s.id;

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM search_results_cache 
    WHERE expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    INSERT INTO analytics (event_type, metadata) 
    VALUES ('cache_cleanup', jsonb_build_object('deleted_count', deleted_count));
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate repository popularity score
CREATE OR REPLACE FUNCTION calculate_popularity_score(
    stars_count INTEGER,
    forks_count INTEGER,
    watchers_count INTEGER,
    contributors_count INTEGER DEFAULT 0
)
RETURNS FLOAT AS $$
BEGIN
    RETURN (
        LOG(GREATEST(stars_count, 1)) * 0.4 +
        LOG(GREATEST(forks_count, 1)) * 0.3 + 
        LOG(GREATEST(watchers_count, 1)) * 0.2 +
        LOG(GREATEST(contributors_count, 1)) * 0.1
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Comments for documentation
COMMENT ON TABLE repositories IS 'Core GitHub repository metadata and cached API responses';
COMMENT ON TABLE embeddings IS 'Pre-computed semantic embeddings from various AI models';
COMMENT ON TABLE classifications IS 'AI-generated repository classifications and categories';
COMMENT ON TABLE sentiment_analysis IS 'Sentiment analysis results for repository descriptions and README content';
COMMENT ON TABLE dependencies IS 'Extracted dependencies from various package managers';
COMMENT ON TABLE contributors IS 'Repository contributors and their contribution statistics';
COMMENT ON TABLE code_patterns IS 'Detected architecture patterns and frameworks';
COMMENT ON TABLE similarity_scores IS 'Pre-computed similarity scores between repository pairs';
COMMENT ON TABLE search_results_cache IS 'Cached search results to avoid recomputation';
COMMENT ON TABLE processing_queue IS 'Queue for batch GPU processing tasks';
COMMENT ON TABLE analytics IS 'Usage analytics and performance metrics';

-- Initial setup complete
SELECT 'Database schema created successfully! Ready for GPU-powered caching.' as status; 