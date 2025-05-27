-- Migration: Add cache table for performance optimization
-- Created: 2025-05-27

CREATE TABLE IF NOT EXISTS cache (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient cleanup of expired items
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);

-- Index for key lookups (already covered by PRIMARY KEY, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_cache_key ON cache(key);

-- Add comments for documentation
COMMENT ON TABLE cache IS 'Application cache for storing API responses and computed data';
COMMENT ON COLUMN cache.key IS 'Unique cache key identifier';
COMMENT ON COLUMN cache.value IS 'JSON-serialized cached value';
COMMENT ON COLUMN cache.expires_at IS 'Expiration timestamp for automatic cleanup';
COMMENT ON COLUMN cache.created_at IS 'Cache entry creation timestamp';
COMMENT ON COLUMN cache.updated_at IS 'Cache entry last update timestamp';

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_cache_updated_at ON cache;
CREATE TRIGGER trigger_cache_updated_at
    BEFORE UPDATE ON cache
    FOR EACH ROW
    EXECUTE FUNCTION update_cache_updated_at(); 