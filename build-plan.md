# Job Pipeline Build Plan

## Quick‑glance summary
The build starts with manual prep — getting cloud infrastructure, email‑sending prerequisites, and API keys in place — then moves into Windsurf‑powered coding of scrapers, enrichment micro‑services, and outreach workers. Containerisation and orchestration (Docker Compose + n8n) follow, before finishing with compliance checks, monitoring, and future enhancements. This order minimises blockers and keeps you legally compliant from day one. 

**Useful Resources:**
- [n8n Docs](https://docs.n8n.io/)
- [Federal Trade Commission](https://www.ftc.gov/)
- [SerpApi](https://serpapi.com/)
- [Oxylabs](https://oxylabs.io/)
- [Hunter](https://hunter.io/)
- [ZeroBounce](https://www.zerobounce.net/)
- [SendGrid](https://sendgrid.com/)
- [Docker](https://www.docker.com/)
- [Apify Documentation](https://docs.apify.com/)

## Phase 0 – Foundation (manual)
- [ ] Register project‑wide API keys: SerpAPI, Hunter.io, ZeroBounce, SendGrid. 
  - [SerpApi](https://serpapi.com/)
  - [Hunter](https://hunter.io/)
  - [ZeroBounce](https://www.zerobounce.net/)
  - [SendGrid](https://sendgrid.com/)
- [ ] Warm a dedicated sending domain & set SPF/DKIM/DMARC to protect deliverability. (Use your ESP docs.)
- [ ] Provision a host (cloud VM or on‑prem) with at least 2 vCPU, 4 GB RAM for Docker‑based services.
- [ ] Open ports 5678 (n8n), 5432 (Postgres) and configure a firewall.
- [ ] Create a Git repository for version control (GitHub/GitLab).

## Phase 1 – Spin up Windsurf workspace
- [ ] Install the Windsurf plugin, open Cascade (Ctrl/⌘ + L). 
- [ ] Use Windsurf's MCP servers to launch local Postgres & Playwright test containers. 
- [x] Commit an empty "jobs‑pipeline" project structure to Git.

## Phase 2 – Database & schemas
- [x] Ask Cascade to generate a PostgreSQL Docker Compose service (persistent volume, strong password). 
- [x] Create jobs, email_events, unsubscribe_list tables with id primary keys and collected_at timestamp columns.
- [x] Write an idempotent migration script (sqlx or knex) and add to CI.

## Phase 3 – Scraping & API ingestion
- [x] Code an HTTP client hitting SerpAPI Google Jobs endpoint for each of the 10 titles. 
- [x] Build a Playwright scraper (fallback for boards without APIs) with rotating proxies. 
- [x] Log raw responses to a raw_json column for debugging.

## Phase 4 – Contact enrichment & validation
- [x] Integrate Hunter.io Email Finder API; cache results by domain. 
- [x] Use Hunter.io API to gather additional company information where available. 
- [x] Pipe all candidate emails through ZeroBounce validation; reject catch‑all or invalid. 

## Phase 5 – Outreach worker
- [x] Design a SendGrid dynamic template with {first_name}, {company}, {role} merge fields. 
- [x] Implement rate-limiting (≤100 emails / min) and webhook handling for bounces.
- [x] Store send events in email_events table.

## Phase 6 – Containerisation & orchestration
- [x] Write a Dockerfile for the TypeScript worker (scrape + enrich + email).
- [x] Create docker‑compose.yml with services: worker, postgres, n8n. 
- [x] In n8n, add a Schedule Trigger (daily 08:00 ET) → Execute Command (docker run worker). 
- [x] Store all API keys in environment variables (n8n Credentials vault not available on Community Plan).

## Phase 7 – Compliance & deliverability (Partially Complete)

### Code Implementation (Complete ✅)
- [x] Add CAN‑SPAM‑compliant footer support
  - Implemented in `SendGridService` with dynamic template variables
  - Added physical address and unsubscribe URL to all email templates
- [x] Subject line validation and consent tracking
  - Added `EmailValidator` class with subject validation
  - Implemented consent tracking in `email_consent` table
  - Added subject line validation rules (length, prohibited words, etc.)
- [x] DMARC/SPF/DKIM configuration
  - Added configuration options in code
  - Included setup instructions in README

### Manual Steps Required (Not Started ⚠️)
- [ ] Configure DMARC/SPF/DKIM records in your domain's DNS
- [ ] Set up BIMI records after verifying domain ownership
- [ ] Complete domain authentication in SendGrid dashboard
- [ ] Test email deliverability and monitor spam scores

**Next Steps:**
1. Follow the DNS configuration guide in README.md
2. Use a tool like [Mail-Tester](https://www.mail-tester.com/) to verify your setup
3. Monitor email deliverability metrics in SendGrid

## Phase 8 – Monitoring & backup (Blocked until Phase 7 manual steps complete)
- [ ] Pipe container logs to Grafana/Prometheus or CloudWatch.
- [ ] Schedule nightly pg_dump backup to object storage.
- [ ] Create n8n alerts on workflow failure > 3 retries.

## Phase 9 – Future enhancements
- [ ] Add OpenAI embeddings to rank roles by fill difficulty.
- [ ] Sync qualified leads to a CRM (HubSpot/Pipedrive) via n8n node.
- [ ] Automate reply sentiment tagging using GPT in n8n Function node.
- [ ] Track LinkedIn's anti‑scraping changes; prefer official APIs when released.
