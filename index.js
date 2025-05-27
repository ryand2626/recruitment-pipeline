/**
 * Jobs Pipeline - Main Application Entry Point
 * Orchestrates the scraping, enrichment, and outreach processes
 */

const express = require('express');
const cron = require('node-cron');
const container = require('./src/container');
const { initializeServices } = require('./src/service-registration');

// Module-level service variables
let logger = null;
let scrapersService = null;
let enrichmentService = null;
let outreachWorker = null;
let config = null;

// Create single Express app
const app = express();

// Parse JSON request bodies
app.use(express.json());

// Initialize the application
async function init() {
  try {
    console.log('Initializing Jobs Pipeline application...');
    
    // Initialize all services and register them in the container
    initializeServices();

    // Resolve core services from the container
    try {
      logger = container.get('logger');
      config = container.get('config');
      console.log('✅ Logger and Config services initialized.');
    } catch (e) {
      console.error('❌ Fatal Error: Could not resolve logger or config from DI container.', e);
      process.exit(1);
    }

    try {
      scrapersService = container.get('smartScraper'); // Use smart scraper instead
      enrichmentService = container.get('enrichmentService');
      outreachWorker = container.get('outreachWorker');
      logger.info('✅ All pipeline services initialized successfully.');
    } catch (e) {
      logger.error('❌ Fatal Error: Could not resolve pipeline services from DI container.', e);
      process.exit(1);
    }
    
    // Set up routes
    setupRoutes();
    
    // Set up scheduled jobs
    setupScheduledJobs();
    
    logger.info('✅ Jobs Pipeline application initialized successfully.');
  } catch (error) {
    const log = logger || console;
    log.error('❌ Fatal error initializing application', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Set up Express routes
function setupRoutes() {
  // Health check endpoint
  app.get('/health', async (req, res) => {
    if (!logger) return res.status(503).json({ error: 'Logger not available' });
    
    try {
      const healthCheck = require('./src/health');
      const health = await healthCheck.runAllChecks();
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'warning' ? 200 : 503;
      
      logger.info('Health check requested');
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      res.status(500).json({ 
        status: 'error', 
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // API info endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'Job Pipeline API',
      version: require('./package.json').version,
      status: 'running',
      endpoints: {
        health: '/health',
        scrape: 'POST /trigger/scrape',
        enrich: 'POST /trigger/enrich',
        outreach: 'POST /trigger/outreach',
        webhook: 'POST /webhook/sendgrid'
      }
    });
  });
  
  // Manual trigger endpoints
  app.post('/trigger/scrape', async (req, res) => {
    if (!logger || !scrapersService) {
      return res.status(503).json({ error: 'Scraping service not available' });
    }
    
    try {
      logger.info('Manual scraping triggered via API', { params: req.body });
      
      // Extract options from request body
      const options = {
        location: req.body.location || 'United States',
        maxItems: req.body.maxItems || 50,
        pages: req.body.pages || 3,
        minResults: req.body.minResults || 10
      };
      
      // Run scraping and return results immediately
      const results = await runScraping(options);
      
      logger.info('Manual scraping via API completed.', { results });
      return res.json({ 
        success: true,
        message: 'Smart scraping completed successfully',
        results,
        strategy: results.strategy,
        rateLimitInfo: results.rateLimitInfo,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in manual scraping via API', { error: error.message });
      return res.status(500).json({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  app.post('/trigger/enrich', async (req, res) => {
    if (!logger || !enrichmentService) {
      return res.status(503).json({ error: 'Enrichment service not available' });
    }
    
    try {
      logger.info('Manual enrichment triggered via API');
      
      runEnrichment()
        .then(results => logger.info('Manual enrichment via API completed.', { results }))
        .catch(error => logger.error('Error in manual enrichment via API.', { error: error.message }));
      
      return res.status(202).json({ 
        status: 'accepted', 
        message: 'Enrichment process initiated.',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error triggering manual enrichment via API', { error: error.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  app.post('/trigger/outreach', async (req, res) => {
    if (!logger || !outreachWorker) {
      return res.status(503).json({ error: 'Outreach service not available' });
    }
    
    try {
      logger.info('Manual outreach triggered via API');
      
      runOutreach()
        .then(results => logger.info('Manual outreach via API completed.', { results }))
        .catch(error => logger.error('Error in manual outreach via API.', { error: error.message }));
      
      return res.status(202).json({ 
        status: 'accepted', 
        message: 'Outreach process initiated.',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error triggering manual outreach via API', { error: error.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // SendGrid webhook endpoint
  app.post('/webhook/sendgrid', async (req, res) => {
    if (!logger || !outreachWorker) {
      return res.status(503).json({ error: 'Outreach service not available' });
    }

    try {
      const events = req.body;
      
      if (!Array.isArray(events)) {
        logger.warn('Received non-array webhook data from SendGrid', { data: events });
        return res.status(400).json({ error: 'Expected array of events' });
      }
      
      logger.info(`Received ${events.length} SendGrid webhook events`);
      
      // Process events using the sendgrid service
      const sendgridService = container.get('sendgridService');
      const results = await Promise.allSettled(
        events.map(event => sendgridService.processWebhookEvent(event))
      );
      
      const processedCount = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
      const failedCount = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null)).length;

      logger.info(`Webhook processing complete. Processed: ${processedCount}, Failed/Skipped: ${failedCount}`);
      
      return res.status(200).json({
        message: "Events received",
        received: events.length,
        successfully_processed: processedCount,
        failed_or_skipped_processing: failedCount
      });
    } catch (error) {
      logger.error('Error processing SendGrid webhook events', { error: error.message });
      return res.status(500).json({ error: 'Error processing webhook events' });
    }
  });

  // Start the server
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, () => {
    logger.info(`🚀 Job Pipeline API server started on port ${PORT}`);
    logger.info(`📊 Health check: http://localhost:${PORT}/health`);
    logger.info(`🔗 API endpoints: http://localhost:${PORT}/`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });

  return server;
}

// Set up scheduled jobs using node-cron
function setupScheduledJobs() {
  if (!logger || !config) {
    console.error("Cannot setup scheduled jobs: logger or config not initialized.");
    return;
  }

  const jobsConfig = config.scheduledJobs || {};

  // Schedule scraping job
  if (jobsConfig.scraping?.enabled !== false && jobsConfig.scraping?.cron) {
    cron.schedule(jobsConfig.scraping.cron, async () => {
      logger.info('Running scheduled scraping job.');
      try {
        await runScraping();
        logger.info('Scheduled scraping job completed.');
      } catch (error) {
        logger.error('Error in scheduled scraping job', { error: error.message });
      }
    });
    logger.info(`📅 Scheduled scraping job: ${jobsConfig.scraping.cron}`);
  } else {
    logger.info("Scheduled scraping job is disabled or cron not configured.");
  }
  
  // Schedule enrichment job
  if (jobsConfig.enrichment?.enabled !== false && jobsConfig.enrichment?.cron) {
    cron.schedule(jobsConfig.enrichment.cron, async () => {
      logger.info('Running scheduled enrichment job.');
      try {
        await runEnrichment();
        logger.info('Scheduled enrichment job completed.');
      } catch (error) {
        logger.error('Error in scheduled enrichment job', { error: error.message });
      }
    });
    logger.info(`📅 Scheduled enrichment job: ${jobsConfig.enrichment.cron}`);
  } else {
     logger.info("Scheduled enrichment job is disabled or cron not configured.");
  }
  
  // Schedule outreach job
  if (jobsConfig.outreach?.enabled !== false && jobsConfig.outreach?.cron) {
    cron.schedule(jobsConfig.outreach.cron, async () => {
      logger.info('Running scheduled outreach job.');
      try {
        await runOutreach();
        logger.info('Scheduled outreach job completed.');
      } catch (error) {
        logger.error('Error in scheduled outreach job', { error: error.message });
      }
    });
    logger.info(`📅 Scheduled outreach job: ${jobsConfig.outreach.cron}`);
  } else {
    logger.info("Scheduled outreach job is disabled or cron not configured.");
  }
}

// Execute the scraping process
async function runScraping(options = {}) {
  if (!logger || !scrapersService) {
    (logger || console).error('Scraping cannot run: logger or scrapersService not initialized.');
    return { error: 'Services not initialized' };
  }
  
  logger.info('🔍 Starting smart scraping process...');
  try {
    // Use smart scraper with default options
    const scrapingOptions = {
      location: options.location || 'United States',
      maxItems: options.maxItems || 50,
      pages: options.pages || 3,
      minResults: options.minResults || 10,
      ...options
    };
    
    const results = await scrapersService.smartScrapeJobs(scrapingOptions);
    logger.info(`✅ Smart scraping completed. Added ${results.total || 0} jobs in total.`);
    return results;
  } catch (error) {
    logger.error('❌ Error in smart scraping process', { error: error.message });
    throw error;
  }
}

// Execute the enrichment process
async function runEnrichment() {
  if (!logger || !enrichmentService) {
    (logger || console).error('Enrichment cannot run: logger or enrichmentService not initialized.');
    return { error: 'Services not initialized' };
  }
  
  logger.info('🔍 Starting enrichment process...');
  try {
    const batchSize = config?.enrichment?.batchSize || 50;
    const results = await enrichmentService.enrichNewJobs(batchSize);
    logger.info(`✅ Enrichment completed. Attempted: ${results.total_attempted || 0}.`);
    return results;
  } catch (error) {
    logger.error('❌ Error in enrichment process', { error: error.message });
    throw error;
  }
}

// Execute the outreach process
async function runOutreach() {
  if (!logger || !outreachWorker) {
    (logger || console).error('Outreach cannot run: logger or outreachWorker not initialized.');
    return { error: 'Services not initialized' };
  }
  
  logger.info('📧 Starting outreach process...');
  try {
    const batchSize = config?.outreach?.batchSize || 20;
    const results = await outreachWorker.processBatch({ batchSize });
    logger.info(`✅ Outreach completed. Queued ${results.successfully_queued || 0} emails.`);
    return results;
  } catch (error) {
    logger.error('❌ Error in outreach process', { error: error.message });
    throw error;
  }
}

// Start the application
async function startApplication() {
  try {
    await init();
    console.log('🎉 Jobs Pipeline application started successfully!');
  } catch (error) {
    console.error('💥 Fatal error starting application:', error);
    process.exit(1);
  }
}

// Only start if this file is run directly
if (require.main === module) {
  startApplication();
}

module.exports = { app, startApplication, init };
