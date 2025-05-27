// src/service-registration.js
const container = require('./container');
const config = require('../config/config'); // Adjusted path
const logger = require('./utils/logger');   // Adjusted path
const db = require('./db/index'); // Fixed path - db is in src/db

// Import factory functions for scrapers
const createSerpApiClient = require('./scrapers/serpapi-client');
const createPlaywrightScraper = require('./scrapers/playwright-scraper');
const createScrapersService = require('./scrapers/index');
const createSmartScraper = require('./scrapers/smart-scraper');

// Import factory functions for enrichment services
const createClearbitService = require('./enrichment/clearbit-service');
const createHunterService = require('./enrichment/hunter-service');
const createZeroBounceService = require('./enrichment/zerobounce-service');
const createEnrichmentService = require('./enrichment/index'); // Main enrichment service factory
const ApifyService = require('./scrapers/apify-service');

// Import factory functions for outreach and utils
const createEmailValidator = require('./utils/email-validator');
const RateLimiter = require('./utils/rate-limiter');
const createSendGridService = require('./outreach/sendgrid-service');
const createOutreachWorker = require('./outreach/index');


function initializeServices() {
  // Register base services (config, logger, db)
  // Using a helper to avoid re-registering if already present
  const registerIfNotExists = (name, factory, serviceLogger) => {
    try {
      container.get(name);
      serviceLogger.debug(`Service already registered: ${name}`);
    } catch (e) {
      container.register(name, factory);
      serviceLogger.info(`Service registered: ${name}`);
    }
  };

  registerIfNotExists('config', () => config, logger);
  registerIfNotExists('logger', () => logger, logger);
  registerIfNotExists('db', () => db, logger);
  
  // Register scraper clients
  registerIfNotExists('serpApiClient', (c) => createSerpApiClient(c.get('config'), c.get('logger')), logger);
  registerIfNotExists('playwrightScraper', (c) => createPlaywrightScraper(c.get('config'), c.get('logger')), logger);
  registerIfNotExists('apifyService', (c) => new ApifyService(c.get('config'), c.get('logger')), logger);
  
  // Register smart scraper (primary scraper with rate limiting)
  registerIfNotExists('smartScraper', (c) => createSmartScraper(
    c.get('serpApiClient'),
    c.get('playwrightScraper'),
    c.get('apifyService'),
    c.get('rateLimiter'),
    c.get('config'),
    c.get('logger')
  ), logger);
  
  // Register legacy scraper service (orchestrator) - kept for compatibility
  registerIfNotExists('scrapersService', (c) => createScrapersService(
    c.get('serpApiClient'),
    c.get('playwrightScraper'),
    c.get('config'),
    c.get('logger')
  ), logger);

  // Register enrichment services
  registerIfNotExists('clearbitService', (c) => createClearbitService(c.get('config'), c.get('logger')), logger);
  registerIfNotExists('hunterService', (c) => createHunterService(c.get('config'), c.get('logger'), c.get('db')), logger);
  registerIfNotExists('zeroBounceService', (c) => createZeroBounceService(c.get('config'), c.get('logger')), logger);
  
  // Register main enrichment service
  registerIfNotExists('enrichmentService', (c) => createEnrichmentService(
    c.get('hunterService'),
    c.get('clearbitService'),
    c.get('zeroBounceService'),
    c.get('db'),
    c.get('logger')
  ), logger);

  // Register utility and outreach services
  registerIfNotExists('rateLimiter', (c) => new RateLimiter(c.get('config'), c.get('logger')), logger);
  registerIfNotExists('emailValidator', (c) => createEmailValidator(c.get('config'), c.get('logger'), c.get('db')), logger);

  registerIfNotExists('sendgridService', (c) => createSendGridService(
    c.get('config'),
    c.get('logger'),
    c.get('db'),
    c.get('emailValidator') // emailValidator is now a registered service
  ), logger);

  registerIfNotExists('outreachWorker', (c) => createOutreachWorker(
    c.get('sendgridService'),
    c.get('logger'),
    c.get('config')
  ), logger);

  logger.info('All services, including outreach, initialized and registered with DI container.');
}

module.exports = { initializeServices };
