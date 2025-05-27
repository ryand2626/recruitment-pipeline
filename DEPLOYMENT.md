# Job Pipeline Deployment Guide

## Overview

This guide covers deploying the Job Pipeline application in various environments, from local development to production.

## Prerequisites

### System Requirements
- **CPU**: Minimum 2 vCPU (4 vCPU recommended for production)
- **Memory**: Minimum 4 GB RAM (8 GB recommended for production)
- **Storage**: Minimum 20 GB available disk space
- **Network**: Outbound internet access for API calls

### Software Requirements
- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **Node.js**: Version 18 or higher (for local development)
- **PostgreSQL**: Version 13 or higher (if not using Docker)

## Environment Setup

### 1. Clone and Configure

```bash
# Clone the repository
git clone <your-repo-url>
cd robertson-workflow

# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### 2. Required Environment Variables

```bash
# Database Configuration
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=jobsadmin
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=jobspipeline
POSTGRES_SSL=false

# API Keys
SERPAPI_KEY=<your-serpapi-key>
HUNTER_API_KEY=<your-hunter-key>
CLEARBIT_API_KEY=<your-clearbit-key>
ZEROBOUNCE_API_KEY=<your-zerobounce-key>
SENDGRID_API_KEY=<your-sendgrid-key>
APIFY_TOKEN=<your-apify-token>

# Email Configuration
FROM_EMAIL=jr@robertsonwright.co.uk
FROM_NAME=Joe Robertson
SENDGRID_TEMPLATE_ID=<your-template-id>
UNSUBSCRIBE_URL=https://robertsonwright.co.uk/unsubscribe
PHYSICAL_ADDRESS=Robertson Wright, London, UK
EMAIL_RATE_LIMIT=100

# n8n Configuration
N8N_HOST=localhost
N8N_WORKFLOW_ID=<your-workflow-id>

# Optional: Advanced Configuration
USE_APIFY=true
DKIM_ENABLED=true
BIMI_ENABLED=false
```

## Deployment Options

### Option 1: Docker Compose (Recommended)

#### Production Deployment

```bash
# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Development Deployment

```bash
# Start with development overrides
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Run with live reload
docker-compose exec app npm run dev
```

### Option 2: Manual Installation

#### 1. Database Setup

```bash
# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE jobspipeline;
CREATE USER jobsadmin WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE jobspipeline TO jobsadmin;
\q

# Run migrations
npm run migrate
```

#### 2. Application Setup

```bash
# Install dependencies
npm install

# Run database migrations
npm run migrate

# Start the application
npm start
```

### Option 3: Cloud Deployment

#### AWS ECS Deployment

1. **Build and push Docker image**:
```bash
# Build image
docker build -t job-pipeline .

# Tag for ECR
docker tag job-pipeline:latest <account-id>.dkr.ecr.<region>.amazonaws.com/job-pipeline:latest

# Push to ECR
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/job-pipeline:latest
```

2. **Create ECS task definition** (see `aws/task-definition.json`)

3. **Deploy using AWS CLI**:
```bash
aws ecs update-service --cluster job-pipeline --service job-pipeline-service --task-definition job-pipeline:latest
```

#### Google Cloud Run Deployment

```bash
# Build and deploy
gcloud builds submit --tag gcr.io/PROJECT-ID/job-pipeline
gcloud run deploy --image gcr.io/PROJECT-ID/job-pipeline --platform managed
```

## DNS and Email Configuration

### 1. Domain Authentication (SendGrid)

Add these DNS records to your domain:

```dns
# SPF Record
TXT @ "v=spf1 include:sendgrid.net ~all"

# DKIM Records (get from SendGrid dashboard)
CNAME s1._domainkey CNAME s1.domainkey.u<unique-id>.wl<unique-id>.sendgrid.net
CNAME s2._domainkey CNAME s2.domainkey.u<unique-id>.wl<unique-id>.sendgrid.net

# DMARC Record
TXT _dmarc "v=DMARC1; p=none; rua=mailto:dmarc-reports@robertsonwright.co.uk;"
```

### 2. BIMI Configuration (Optional)

```dns
# BIMI Record
TXT default._bimi "v=BIMI1; l=https://robertsonwright.co.uk/logo.svg; a=https://robertsonwright.co.uk/bimi/authority.pem"
```

## Monitoring and Logging

### 1. Application Monitoring

```bash
# Check application health
curl http://localhost:3000/health

# Monitor logs
docker-compose logs -f app

# Check database connectivity
docker-compose exec app npm run test:db
```

### 2. Performance Monitoring

```bash
# Monitor resource usage
docker stats

# Check API response times
npm run test:apis
```

### 3. Log Aggregation

For production, configure log forwarding:

```yaml
# docker-compose.prod.yml
services:
  app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## Security Considerations

### 1. Network Security

```bash
# Configure firewall (Ubuntu/Debian)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 5678/tcp  # n8n (if needed)
sudo ufw enable
```

### 2. SSL/TLS Configuration

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. Environment Security

- Store sensitive environment variables in a secure vault
- Use strong, unique passwords for all services
- Regularly rotate API keys and passwords
- Enable audit logging for all services

## Backup and Recovery

### 1. Database Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U jobsadmin jobspipeline > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker-compose exec -T postgres psql -U jobsadmin jobspipeline < backup_file.sql
```

### 2. Automated Backups

```bash
# Add to crontab
0 2 * * * /path/to/backup-script.sh
```

## Scaling Considerations

### 1. Horizontal Scaling

- Use load balancer (nginx, HAProxy, or cloud LB)
- Scale application containers: `docker-compose up --scale app=3`
- Use external PostgreSQL service (RDS, Cloud SQL)

### 2. Performance Optimization

- Enable Redis for caching
- Use CDN for static assets
- Implement database connection pooling
- Configure rate limiting

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check database status
   docker-compose exec postgres pg_isready
   
   # Check connection from app
   docker-compose exec app npm run test:db
   ```

2. **API Rate Limits**
   ```bash
   # Check API status
   npm run test:apis
   
   # Monitor rate limit headers in logs
   docker-compose logs app | grep "rate"
   ```

3. **Email Delivery Issues**
   ```bash
   # Test email configuration
   npm run test:email
   
   # Check SendGrid dashboard for delivery stats
   ```

### Log Analysis

```bash
# Search for errors
docker-compose logs app | grep ERROR

# Monitor API calls
docker-compose logs app | grep "API call"

# Check database queries
docker-compose logs app | grep "SQL"
```

## Maintenance

### 1. Regular Updates

```bash
# Update dependencies
npm audit fix

# Update Docker images
docker-compose pull
docker-compose up -d
```

### 2. Health Checks

```bash
# Application health
curl http://localhost:3000/health

# Database health
docker-compose exec postgres pg_isready

# API connectivity
npm run test:apis
```

### 3. Performance Monitoring

- Monitor CPU and memory usage
- Track API response times
- Monitor email delivery rates
- Check database performance

## Support

For deployment issues:

1. Check the logs: `docker-compose logs -f`
2. Verify environment variables: `docker-compose config`
3. Test API connectivity: `npm run test:apis`
4. Check database status: `docker-compose exec postgres pg_isready`

For additional support, refer to:
- [README.md](./README.md) - General setup and usage
- [DESIGN_SPEC.md](./DESIGN_SPEC.md) - Architecture details
- [build-plan.md](./build-plan.md) - Development roadmap 