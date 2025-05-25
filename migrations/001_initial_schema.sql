-- jobs_pipeline initial schema migration
-- This is an idempotent migration script that can be run multiple times safely

-- Create extension for UUID support if it doesn't exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create jobs table if it doesn't exist
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    location VARCHAR(255),
    description TEXT,
    salary_range VARCHAR(255),
    job_url TEXT,
    contact_email VARCHAR(255),
    contact_name VARCHAR(255),
    company_domain VARCHAR(255),
    raw_json JSONB,
    source VARCHAR(50) NOT NULL,  -- e.g., "serpapi", "linkedin", "indeed"
    status VARCHAR(50) DEFAULT 'new',  -- e.g., "new", "contacted", "responded"
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on title for faster searches
CREATE INDEX IF NOT EXISTS idx_jobs_title ON jobs(title);

-- Create index on collected_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_jobs_collected_at ON jobs(collected_at);

-- Create index on company for grouping
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);

-- Create email_events table if it doesn't exist
CREATE TABLE IF NOT EXISTS email_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id),
    event_type VARCHAR(50) NOT NULL,  -- e.g., "sent", "opened", "clicked", "bounced"
    email VARCHAR(255) NOT NULL,
    data JSONB,  -- Additional event data from SendGrid
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on job_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_events_job_id ON email_events(job_id);

-- Create index on event_type for filtering
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);

-- Create unsubscribe_list table if it doesn't exist
CREATE TABLE IF NOT EXISTS unsubscribe_list (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    reason TEXT,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on email for quick lookup
CREATE INDEX IF NOT EXISTS idx_unsubscribe_list_email ON unsubscribe_list(email);

-- Create domains_cache table for caching Hunter.io results
CREATE TABLE IF NOT EXISTS domains_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain VARCHAR(255) NOT NULL UNIQUE,
    email_pattern VARCHAR(255),
    contacts JSONB,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on domain for quick lookup
CREATE INDEX IF NOT EXISTS idx_domains_cache_domain ON domains_cache(domain);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
