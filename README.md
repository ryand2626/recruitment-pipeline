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

## Configuring and Using Dynamic Apify Actor Inputs

This project leverages Apify actors for flexible data scraping. The inputs to these actors can be dynamically configured at multiple levels, allowing for tailored scraping behavior.

### 1. Configuration in `config/config.js`

Apify actor configurations are defined within the `apify.actors` array in the `config/config.js` file. Each actor object in this array can have the following key properties:

-   `actorId` (String): The unique identifier of the Apify actor (e.g., "apify/google-search-scraper").
-   `name` (String): A human-readable name for the actor (e.g., "Google Search Scraper").
-   `defaultInput` (Object): An object defining the default input parameters for the actor. These inputs are used if no other overrides are provided.
-   `overridesByJobTitle` (Object): An object where keys are job titles (matching those in `config.jobTitles`) and values are objects that override parts of `defaultInput` for that specific job title.

**Example `config.js` snippet for `apify.actors`:**

```javascript
// In config/config.js
// ...
  apify: {
    token: process.env.APIFY_TOKEN || "YOUR_APIFY_TOKEN",
    proxySettings: { /* ... */ },
    useApify: true,
    actors: [
      {
        actorId: "apify/google-search-scraper",
        name: "Google Search Scraper",
        description: "Scrapes Google search results based on keywords and other parameters.",
        defaultInput: {
          queries: "site:linkedin.com/in/ OR site:linkedin.com/pub/ \"{title}\" \"{company}\" \"{location}\"",
          maxPagesPerQuery: 1,
          resultsPerPage: 10,
          countryCode: "US",
          languageCode: "en"
        },
        overridesByJobTitle: {
          "M&A Analyst": {
            maxPagesPerQuery: 2, // For M&A Analysts, scrape 2 pages instead of 1
            resultsPerPage: 25   // And get 25 results per page
          },
          "Corporate Finance": {
            queries: "site:linkedin.com/in/ \"Corporate Finance\" \"{company}\" \"{location}\"",
            languageCode: "de" // Example: Search in German for Corporate Finance roles
          }
        }
      },
      {
        actorId: "another/example-actor",
        name: "Example LinkedIn Profile Scraper",
        description: "Scrapes specific data from LinkedIn profiles.",
        defaultInput: {
          fields: ["fullName", "location", "experiences"],
          maxProfiles: 10
        },
        overridesByJobTitle: {
          "M&A Associate": {
            maxProfiles: 20,
            searchKeywords: ["mergers", "acquisitions", "finance"] 
          }
        }
      }
      // ... other actor configurations
    ]
  }
// ...
```

### 2. Input Precedence

The `ApifyService` determines the final input for an actor run by merging inputs in the following order of precedence (highest to lowest):

1.  **Runtime Overrides**: Input parameters provided at the time of calling the service (e.g., via the `scripts/test-apis.js` script or an API endpoint). These take the highest priority.
2.  **Job Title Overrides**: If a `jobTitle` is provided and an entry for it exists in the actor's `overridesByJobTitle` configuration, these overrides are applied.
3.  **Default Input**: The actor's `defaultInput` configuration is used as the base.

This layered approach allows for general default settings, specific adjustments for different job titles, and ad-hoc modifications at runtime. When merging, array properties in overriding inputs will replace arrays in the base input; other object properties are merged deeply.

### 3. Testing with `scripts/test-apis.js`

The `scripts/test-apis.js` script provides a way to test the `ApifyService` and experiment with input overrides. You can use the following command-line flags:

-   `--job-title` (or `-j`): Simulates providing a specific job title context. The service will use overrides defined for this job title in `config.js`.
-   `--apify-overrides` (or `-o`): Provides a JSON string for runtime overrides. This JSON string should be an object where keys are actor IDs and values are the input objects for those actors.

**Example Usages:**

1.  **No overrides (uses default inputs for all configured actors):**
    ```bash
    node scripts/test-apis.js
    ```

2.  **Simulating a job title to apply its specific overrides:**
    This will use the `overridesByJobTitle` for "M&A Analyst" from `config.js` for the "apify/google-search-scraper" actor, if defined.
    ```bash
    node scripts/test-apis.js --job-title "M&A Analyst"
    ```

3.  **Providing runtime overrides for a specific actor:**
    This example overrides `resultsPerPage` and `maxPagesPerQuery` for the "apify/google-search-scraper" actor. The JSON string must be properly quoted.
    ```bash
    node scripts/test-apis.js --apify-overrides '{"apify/google-search-scraper": {"resultsPerPage": 5, "maxPagesPerQuery": 1}}'
    ```
    *(Note: In some shells like bash, you might need to ensure the JSON string is correctly escaped or quoted to be passed as a single argument, e.g., using single quotes around the JSON object).*

4.  **Combining job title and runtime overrides:**
    Runtime overrides take precedence. If "M&A Analyst" has a default `resultsPerPage` of 25, the following command will run the "apify/google-search-scraper" with `resultsPerPage: 5` because the runtime override is dominant.
    ```bash
    node scripts/test-apis.js --job-title "M&A Analyst" --apify-overrides '{"apify/google-search-scraper": {"resultsPerPage": 5}}'
    ```

These tools allow for thorough testing and fine-tuning of your Apify actor inputs to match diverse scraping requirements.

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

4. Initialize the database schema by running migrations:

   After ensuring your Docker containers are up and the database service is running, execute the following command from your project root on the host machine (where `docker-compose` commands are run). This command will execute the migration script inside the application container:

   ```bash
   docker-compose exec app npm run migrate
   ```
   This command applies all pending database migrations to set up or update your schema.

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

- Scraping: `POST http://localhost:3001/trigger/scrape`
- Enrichment: `POST http://localhost:3001/trigger/enrich`
- Outreach: `POST http://localhost:3001/trigger/outreach`

##### Streamlit UI Integration with `/trigger/scrape`

The Streamlit user interface (`app.py`) provides a user-friendly way to initiate and customize the scraping process. It leverages the `/trigger/scrape` backend endpoint, sending various parameters to tailor the job search:

-   **Target Job Titles (`target_job_titles`):** Users can specify a list of job titles to search for (e.g., "M&A Analyst", "Investment Banking Associate"). This allows focusing the search on specific roles of interest.
-   **Target States (`target_states`):** Users can define a list of US states for geographic targeting of jobs (e.g., "NY", "CA", "TX"). This helps narrow down results to specific regions. If not provided, a default location (e.g., "United States") might be used by the backend.
-   **Job Sources (`job_sources`):** While deep integration is evolving, this parameter allows the UI to suggest preferred scraping sources (e.g., disabling specific scrapers like SerpApi or Playwright if desired). The backend receives this and can adapt its scraping strategy.
-   **Other Parameters:** The UI also passes parameters like `source_text` (for future job description analysis), `confidence_threshold`, and `processing_mode`. While these are passed to the backend, their comprehensive integration into the core scraping and analysis logic is planned for future enhancements.

These dynamic parameters enable more flexible and targeted job scraping directly from the Streamlit UI, enhancing the system's usability for specific search criteria.

#### Health Check

- Health status: `GET http://localhost:3000/health`

Please refer to the [build-plan.md](build-plan.md) file for the complete implementation plan and progress tracking.

## Testing

This section outlines strategies for testing various parts of the application.

### Testing API Connectivity and Apify Actors

The `scripts/test-apis.js` script can be used to:
- Verify connectivity to external APIs (SerpAPI, Hunter.io, ZeroBounce, SendGrid).
- Test the `ApifyService` directly by running configured Apify actors with default or overridden inputs.
- See the "Configuring and Using Dynamic Apify Actor Inputs" section for more details on using flags like `--job-title` and `--apify-overrides` with this script.

### Testing Streamlit UI Integration

To ensure the parameters from the Streamlit UI (`app.py`) are correctly processed by the backend, the following testing approaches are recommended:

1.  **Automated Script (`scripts/test-streamlit-integration.js`):**
    *   It is recommended to use a dedicated script named `scripts/test-streamlit-integration.js` (this script would need to be created based on suggestions from the testing strategy analysis).
    *   **Purpose:** This script simulates HTTP POST requests to the `/trigger/scrape` endpoint, mimicking how the Streamlit UI sends data. It allows for testing various combinations of parameters like `target_job_titles`, `target_states`, `maxItems`, etc., to verify backend processing.
    *   **Example (Conceptual) Usage:**
        ```bash
        node scripts/test-streamlit-integration.js --target-job-titles "M&A Analyst,Investment Banking Associate" --target-states "NY,CA" --max-items 5
        ```
    *   This script helps in verifying the parameter handling logic in `index.js` and `smart-scraper.js` without needing to manually interact with the UI for every test case.

2.  **Manual UI Testing & Log Verification:**
    *   Perform tests directly through the Streamlit UI by inputting various job titles, states, and other settings.
    *   **Crucially, monitor the backend Node.js application logs.** Check for messages indicating:
        *   The parameters received by `index.js` at the `/trigger/scrape` endpoint.
        *   The options being used by `smartScraper.js` (in `smartScrapeJobs` and `executeApifyScraping`).
        *   The specific inputs being passed to Apify actors (e.g., job titles, locations).
    *   Optionally, verify the scraped data in the database to ensure it aligns with the targeted parameters.
    *   This manual approach provides end-to-end validation of the UI-to-backend parameter flow.

## API Keys Required

- SerpAPI
- Hunter.io
- Clearbit
- ZeroBounce
- SendGrid

## License

Proprietary - All rights reserved.
