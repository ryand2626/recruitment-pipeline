/**
 * Configuration file for the Jobs Pipeline
 * This file centralizes all configuration options.
 * In production, these values should be set as environment variables.
 */

require('dotenv').config();

module.exports = {
  // Database Configuration
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5435', 10),
    user: process.env.POSTGRES_USER || 'jobsadmin',
    password: process.env.POSTGRES_PASSWORD || 'X2tP9vR7sQ4mE5jL8kF3wA6bC1dN0pZ',
    database: process.env.POSTGRES_DB || 'jobspipeline',
    ssl: process.env.POSTGRES_SSL === 'true'
  },
  
  // API Keys
  apiKeys: {
    serpApi: process.env.SERPAPI_KEY || '',
    hunter: process.env.HUNTER_API_KEY || '',
    clearbit: process.env.CLEARBIT_API_KEY || '',
    zeroBounce: process.env.ZEROBOUNCE_API_KEY || '',
    sendGrid: process.env.SENDGRID_API_KEY || ''
  },
  
  // Job Titles to search for
  jobTitles: [
    'M&A Associate',
    'M&A Analyst',
    'Vice President M&A',
    'M&A Director',
    'Managing Director - Investment Banking',
    'Director - Investment Banking',
    'Investment Banking Analyst',
    'Investment Banking Associate',
    'Vice President - Investment Banking',
    'Corporate Finance'
  ],
  
  // Scraping Configuration
  scraping: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    concurrentRequests: 5,
    requestDelay: 2000, // ms between requests to avoid rate limiting
    requestTimeout: 30000, // ms
    retries: 3
  },
  
  // Email Configuration
  email: {
    fromEmail: process.env.FROM_EMAIL || 'jr@robertsonwright.co.uk',
    fromName: process.env.FROM_NAME || 'Joe Robertson',
    templateId: process.env.SENDGRID_TEMPLATE_ID || '',
    unsubscribeUrl: process.env.UNSUBSCRIBE_URL || 'https://robertsonwright.co.uk/unsubscribe',
    physicalAddress: process.env.PHYSICAL_ADDRESS || 'Robertson Wright, London, UK',
    rateLimitPerMinute: parseInt(process.env.EMAIL_RATE_LIMIT || '100', 10),
    
    // Compliance settings
    compliance: {
      // Subject line requirements
      maxSubjectLength: 100,
      requiredSubjectElements: [],
      prohibitedWords: ['free', 'win', 'prize', 'cash', 'act now', 'limited time', 'urgent'],
      
      // DMARC/SPF/DKIM settings
      dkimEnabled: process.env.DKIM_ENABLED === 'true',
      dkimSelector: process.env.DKIM_SELECTOR || 's1',
      dkimPrivateKey: process.env.DKIM_PRIVATE_KEY || '',
      spfRecord: process.env.SPF_RECORD || 'v=spf1 include:sendgrid.net ~all',
      dmarcPolicy: process.env.DMARC_POLICY || 'v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com;',
      
      // BIMI settings
      bimiEnabled: process.env.BIMI_ENABLED === 'true',
      bimiLogoUrl: process.env.BIMI_LOGO_URL || 'https://yourdomain.com/logo.svg',
      bimiAuthorityUrl: process.env.BIMI_AUTHORITY_URL || 'https://yourdomain.com/bimi/authority-record.json',
      
      // Consent logging
      logConsentStatus: true,
      consentExpiryDays: 30
    }
  },
  
  // n8n Configuration
  n8n: {
    url: `http://${process.env.N8N_HOST || 'localhost'}:5678`,
    workflowId: process.env.N8N_WORKFLOW_ID || ''
  },

  // Retry Configuration for API calls
  retryConfig: {
    default: {
      retries: 3,
      initialDelayMs: 1000, // Use 'Ms' suffix for clarity
      maxDelayMs: 30000,    // 30 seconds max delay
      backoffFactor: 2,
      jitter: true
      // shouldRetry: undefined, // Path to a custom retry function file if needed globally
    },
    services: {
      clearbit: {
        // inherits from default, can override specific properties
        // e.g., initialDelayMs: 1500 
      },
      hunter: {}, // Will use default
      zeroBounce: {}, // Will use default
      serpApi: {
        initialDelayMs: 2000 // As previously set for SerpAPI
      },
      sendGrid: {
        initialDelayMs: 5000 // As previously set for SendGrid
        // We might also want to add a custom shouldRetry function path here later if needed
        // e.g., shouldRetry: './custom-should-retry-sendgrid.js' 
      }
    }
  },

  // Apify Configuration
  apify: {
    token: process.env.APIFY_TOKEN || "YOUR_APIFY_TOKEN", // Placeholder, should be set via ENV
    proxySettings: {
      proxyGroups: ["RESIDENTIAL"],
      countryCode: "US"
    },
    useApify: process.env.USE_APIFY === 'true' || true, // Default to true if not set
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
        // No overrides for this actor by default
        overridesByJobTitle: {} 
      },
      {
        actorId: "another/example-actor", // Replace with a real actor ID if available
        name: "Example LinkedIn Profile Scraper",
        description: "Scrapes specific data from LinkedIn profiles.",
        defaultInput: {
          // Define default input fields for this actor
          // e.g., fields: ["fullName", "location", "experiences"],
          // maxProfiles: 10
        },
        overridesByJobTitle: {
          "M&A Associate": {
            // Specific input overrides for "M&A Associate"
            // e.g., maxProfiles: 20,
            // searchKeywords: ["mergers", "acquisitions", "finance"] 
          },
          "Investment Banking Analyst": {
            // Specific input overrides for "Investment Banking Analyst"
            // e.g., fields: ["fullName", "location", "experiences", "education"]
          }
        }
      }
    ]
  }
};
