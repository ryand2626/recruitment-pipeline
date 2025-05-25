# Jobs Pipeline

A comprehensive pipeline for scraping, enriching, and outreach for investment banking and M&A job roles.

## Project Overview

This project implements an automated pipeline that:
1. Scrapes job listings for 10 specific investment banking and M&A roles
2. Enriches the data with contact information and company details
3. Conducts outreach via email with compliance considerations
4. Orchestrates the entire workflow using containerization and scheduling

## Target Job Titles

The system is configured to search for the following 10 job titles:

1. M&A Associate 
2. M&A Analyst
3. Vice President M&A 
4. M&A Director 
5. Managing Director - Investment Banking
6. Director - Investment Banking
7. Investment Banking Analyst 
8. Investment Banking Associate
9. Vice President - Investment Banking
10. Corporate Finance

## Project Structure

```
jobs-pipeline/
├── src/                  # Source code
│   ├── scrapers/         # Job board scrapers and API clients
│   ├── enrichment/       # Contact enrichment services
│   ├── outreach/         # Email templating and sending
│   └── db/               # Database models and utilities
├── config/               # Configuration files
├── docker/               # Docker-related files
├── migrations/           # Database migration scripts
└── scripts/              # Utility scripts
```

## Getting Started

### Prerequisites

- Docker and Docker Compose installed
- API keys for all required services (see below)
- Domain with proper email sending setup (SPF, DKIM, DMARC)

## Email Compliance Setup

This application includes comprehensive email compliance features to ensure deliverability and legal compliance. Follow these steps to configure email compliance properly.

### 1. CAN-SPAM Compliance

The system automatically adds the following CAN-SPAM required elements:
- Physical address in email footer
- One-click unsubscribe link
- Clear identification as an advertisement
- Accurate header information

### 2. DMARC, SPF, and DKIM Configuration

#### SPF Record
Add the following TXT record to your domain's DNS:
```
v=spf1 include:sendgrid.net ~all
```

#### DKIM Configuration
1. Generate a DKIM key pair:
   ```bash
   openssl genrsa -out dkim_private.pem 2048
   openssl rsa -in dkim_private.pem -pubout -out dkim_public.pem
   ```
2. Add the public key to your DNS as a TXT record:
   ```
   s1._domainkey.yourdomain.com. 3600 IN TXT "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"
   ```
3. Set the `DKIM_PRIVATE_KEY` in your `.env` file with the private key content.

#### DMARC Policy
Add this DMARC TXT record to your domain's DNS:
```
_dmarc.yourdomain.com. 3600 IN TXT "v=DMARK1; p=none; rua=mailto:dmarc-reports@yourdomain.com;"
```

### 3. BIMI Setup (Optional)

1. Create a square SVG logo (minimum 112x112px)
2. Host it at a public URL
3. Create a BIMI authority record (JSON) and host it
4. Add the following DNS records:
   ```
   default._bimi.yourdomain.com. 3600 IN TXT "v=BIMI1; l=https://yourdomain.com/logo.svg; a=https://yourdomain.com/bimi/authority-record.json;"
   ```

### 4. Email Sending Domain Authentication

1. In your SendGrid dashboard, go to Settings > Sender Authentication
2. Follow the wizard to authenticate your domain
3. Add the provided DNS records to your domain

### 5. Unsubscribe Management

- The system automatically adds an unsubscribe link to all emails
- Unsubscribes are tracked in the `email_consent` table
- Users can resubscribe by visiting the unsubscribe URL with `?action=resubscribe`

### 6. Rate Limiting

- Default rate limit: 100 emails per minute (configurable via `EMAIL_RATE_LIMIT`)
- The system enforces this limit to prevent being flagged as spam

## Setup Instructions

1. Clone the repository

2. Create a `.env` file with your API keys and configuration (see `.env.example` for reference)

3. Run the Docker Compose stack:

   ```bash
   docker-compose up -d
   ```

4. Initialize the database:

   ```bash
   docker exec jobs-pipeline-postgres psql -U jobsadmin -d jobspipeline -f /docker-entrypoint-initdb.d/001_initial_schema.sql
   ```

5. Access the n8n dashboard at http://localhost:5678 and login with the credentials from your `.env` file (default is admin/D7yH9xK2pF5mT3bW)

6. Store your API keys in the n8n Credentials vault for secure access

### Running the Pipeline

#### Automatic Schedule

The pipeline runs on an automatic schedule as follows:

- **Scraping**: Daily at 1:00 AM
- **Enrichment**: Daily at 3:00 AM
- **Outreach**: Daily at 8:00 AM ET

#### Manual Triggers

You can also trigger individual steps manually via API endpoints:

- Scraping: `POST http://localhost:3000/trigger/scrape`
- Enrichment: `POST http://localhost:3000/trigger/enrich`
- Outreach: `POST http://localhost:3000/trigger/outreach`

#### Health Check

- Health status: `GET http://localhost:3000/health`

Please refer to the [build-plan.md](build-plan.md) file for the complete implementation plan and progress tracking.

## API Keys Required

- SerpAPI
- Hunter.io
- Clearbit
- ZeroBounce
- SendGrid

## License

Proprietary - All rights reserved.
