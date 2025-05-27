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
    password: process.env.POSTGRES_PASSWORD,
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
    sendgridWebhookSigningKey: process.env.SENDGRID_WEBHOOK_SIGNING_KEY || '',
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

  // API Rate Limiting Configuration
  rateLimits: {
    serpApi: {
      dailyLimit: 2,
      enabled: false, // Disable due to severe limits
      fallbackToApify: true
    },
    hunter: {
      dailyLimit: 2,
      enabled: false, // Disable due to severe limits
      fallbackToApify: true
    },
    zeroBounce: {
      dailyLimit: 100,
      enabled: true // Keep enabled, manageable limit
    },
    sendGrid: {
      dailyLimit: 100,
      enabled: true // Keep enabled, sufficient for testing
    }
  },

  // Apify Configuration - Primary scraping engine
  apify: {
    token: process.env.APIFY_TOKEN,
    proxySettings: {
      proxyGroups: ["RESIDENTIAL"],
      countryCode: "US"
    },
    useApify: process.env.USE_APIFY === 'true' || true,
    
    // Working Apify actors for job scraping
    actors: [
      {
        actorId: "borderline/indeed-scraper",
        name: "Indeed Job Scraper",
        description: "Fast and reliable Indeed Job Scraper with advanced filters.",
        priority: 1, // Primary scraper
        defaultInput: {
          keyword: "{jobTitle}",
          location: "United States",
          maxItems: 50,
          datePosted: "7"
        },
        overridesByJobTitle: {
          "M&A Associate": {
            maxItems: 100,
            location: "New York, NY"
          },
          "Investment Banking Analyst": {
            maxItems: 100,
            location: "New York, NY"
          }
        }
      },
      {
        actorId: "curious_coder/linkedin-jobs-scraper",
        name: "LinkedIn Jobs Scraper",
        description: "Scrapes job postings from LinkedIn with company details.",
        priority: 2,
        defaultInput: {
          keyword: "{jobTitle}",
          location: "United States",
          maxItems: 50,
          datePosted: "week"
        },
        overridesByJobTitle: {
          "Managing Director - Investment Banking": {
            maxItems: 30,
            location: "New York, NY"
          },
          "Vice President M&A": {
            maxItems: 40,
            location: "New York, NY"
          }
        }
      },
      {
        actorId: "websift/seek-job-scraper",
        name: "Seek Job Scraper",
        description: "Scrapes job listings from seek.com.au for Australian market.",
        priority: 3,
        defaultInput: {
          keyword: "{jobTitle}",
          location: "Australia",
          maxItems: 30
        },
        overridesByJobTitle: {
          "Corporate Finance": {
            location: "Sydney, Australia",
            maxItems: 40
          }
        }
      },
      {
        actorId: "code_crafter/apollo-io-scraper",
        name: "Apollo.io Contact Scraper",
        description: "Scrapes contact information from Apollo.io for lead enrichment.",
        priority: 4,
        defaultInput: {
          searchUrl: "https://app.apollo.io/",
          maxItems: 50
        }
      },
      {
        actorId: "apify/web-scraper",
        name: "Generic Web Scraper",
        description: "Scrapes job boards not covered by specific actors.",
        priority: 5,
        defaultInput: {
          startUrls: [
            "https://jobs.lever.co/search?query={jobTitle}",
            "https://boards.greenhouse.io/search?q={jobTitle}",
            "https://angel.co/jobs?keywords={jobTitle}"
          ],
          maxRequestsPerCrawl: 100,
          maxConcurrency: 5
        }
      }
    ],

    // Fallback configuration when primary APIs are rate-limited
    fallbackStrategies: {
      jobScraping: {
        primary: ["borderline/indeed-scraper", "curious_coder/linkedin-jobs-scraper"],
        secondary: ["websift/seek-job-scraper"],
        tertiary: ["apify/web-scraper"]
      },
      contactEnrichment: {
        primary: ["code_crafter/apollo-io-scraper"],
        secondary: ["apify/web-scraper"],
        fallbackToManual: true
      }
    }
  }
};
