/**
 * Jobs Pipeline - Main Application Entry Point
 * Orchestrates the scraping, enrichment, and outreach processes
 */

const express = require('express');
const cron = require('node-cron');
// const scrapers = require('./src/scrapers'); // Remove
// const enrichmentService = require('./src/enrichment'); // Remove
// const outreachWorker = require('./src/outreach'); // Remove
// const logger = require('./src/utils/logger'); // Remove

const container = require('./src/container');
const { initializeServices } = require('./src/service-registration');
const healthCheck = require('./src/health');
const http = require('http');
const url = require('url');

// Module-level service variables, initialized in init()
let logger = null;
let scrapersService = null;
let enrichmentService = null;
let outreachWorker = null;
let config = null; // To get port for webhook server

// Create Express app for webhook handling and manual triggers
const app = express();
// Port will be determined in init from config

// Parse JSON request bodies
app.use(express.json());

// Initialize the application
async function init() {
  try {
    // Initialize all services and register them in the container
    initializeServices(); // This should synchronously register factories

    // Resolve core services from the container
    // Logger is critical, try to get it first.
    try {
      logger = container.get('logger');
      config = container.get('config'); // Get config for port and other settings
    } catch (e) {
      // If logger itself fails, use console.error
      console.error('Fatal Error: Could not resolve logger or config from DI container.', e);
      process.exit(1);
    }

    logger.info('Logger and Config services initialized.');

    scrapersService = container.get('scrapersService');
    enrichmentService = container.get('enrichmentService');
    outreachWorker = container.get('outreachWorker'); // This is the OutreachWorker instance

    logger.info('Initializing Jobs Pipeline application with DI services...');
    
    // Start webhook server using the OutreachWorker's method
    // The port should come from config now, via the OutreachWorker or directly
    // outreachWorker.initWebhookServer() will use its own configured port
    await outreachWorker.initWebhookServer(); // outreachWorker now gets port from its own config
    
    // Set up routes
    setupRoutes();
    
    // Set up scheduled jobs
    setupScheduledJobs();
    
    logger.info('Jobs Pipeline application initialized successfully.');
  } catch (error) {
    // Use console.error if logger is not available
    const log = logger || console;
    log.error('Fatal error initializing application', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Set up Express routes
function setupRoutes() {
  // SendGrid webhook endpoint is now managed by outreachWorker.initWebhookServer() internally
  // We just need to ensure the app instance is passed or routes are setup there.
  // For now, assuming outreachWorker.initWebhookServer() sets up its own routes on the app it creates.
  // If OutreachWorker needs to add routes to *this* app instance, it would need app passed to it.
  // The current OutreachWorker creates its own express app.
  // This means the app instance here is only for manual triggers and health checks.
  // If a single app instance is desired, OutreachWorker's initWebhookServer needs refactoring.
  // For this task, we assume the two app instances are fine (one for webhook, one for triggers).
  // However, the /webhook/sendgrid route here is now redundant if outreachWorker handles it.
  // Let's keep it but note it might conflict or be unused if outreachWorker's server is separate.
  // UPDATE: The OutreachWorker's initWebhookServer is standalone.
  // The routes here are for the main application (manual triggers, health).

  app.get('/health', (req, res) => {
    if (!logger) return res.status(503).send('Logger not available');
    logger.info('Health check requested');
    res.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });
  
  app.post('/trigger/scrape', async (req, res) => {
    if (!logger || !scrapersService) return res.status(503).send('Scraping service not available');
    try {
      logger.info('Manual scraping triggered via API');
      runScraping() // No await, run in background
        .then(results => logger.info('Manual scraping via API completed.', { results }))
        .catch(error => logger.error('Error in manual scraping via API.', { error: error.message, stack: error.stack }));
      return res.status(202).send({ status: 'accepted', message: 'Scraping process initiated.' });
    } catch (error) {
      logger.error('Error triggering manual scraping via API', { error: error.message, stack: error.stack });
      return res.status(500).send('Internal server error');
    }
  });
  
  app.post('/trigger/enrich', async (req, res) => {
    if (!logger || !enrichmentService) return res.status(503).send('Enrichment service not available');
    try {
      logger.info('Manual enrichment triggered via API');
      runEnrichment() // No await, run in background
        .then(results => logger.info('Manual enrichment via API completed.', { results }))
        .catch(error => logger.error('Error in manual enrichment via API.', { error: error.message, stack: error.stack }));
      return res.status(202).send({ status: 'accepted', message: 'Enrichment process initiated.' });
    } catch (error) {
      logger.error('Error triggering manual enrichment via API', { error: error.message, stack: error.stack });
      return res.status(500).send('Internal server error');
    }
  });
  
  app.post('/trigger/outreach', async (req, res) => {
    if (!logger || !outreachWorker) return res.status(503).send('Outreach service not available');
    try {
      logger.info('Manual outreach triggered via API');
      runOutreach() // No await, run in background
        .then(results => logger.info('Manual outreach via API completed.', { results }))
        .catch(error => logger.error('Error in manual outreach via API.', { error: error.message, stack: error.stack }));
      return res.status(202).send({ status: 'accepted', message: 'Outreach process initiated.' });
    } catch (error) {
      logger.error('Error triggering manual outreach via API', { error: error.message, stack: error.stack });
      return res.status(500).send('Internal server error');
    }
  });

  // Main application listener (for manual triggers, health)
  // Port for this app should be different from webhook port if they are separate servers.
  const mainAppPort = config?.ports?.mainApp || 3001; // Example: get from config or default
  app.listen(mainAppPort, () => {
    logger.info(`Main application server (triggers, health) listening on port ${mainAppPort}`);
  });
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
        logger.error('Error in scheduled scraping job', { error: error.message, stack: error.stack });
      }
    });
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
        logger.error('Error in scheduled enrichment job', { error: error.message, stack: error.stack });
      }
    });
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
        logger.error('Error in scheduled outreach job', { error: error.message, stack: error.stack });
      }
    });
  } else {
    logger.info("Scheduled outreach job is disabled or cron not configured.");
  }
}

// Execute the scraping process
async function runScraping() {
  if (!logger || !scrapersService) {
    (logger || console).error('Scraping cannot run: logger or scrapersService not initialized.');
    return;
  }
  logger.info('Starting scraping process...');
  try {
    const results = await scrapersService.runAllScrapers(); // Use DI service
    logger.info(`Scraping completed. Added ${results.total || 0} jobs in total.`);
    return results;
  } catch (error) {
    logger.error('Error in scraping process', { error: error.message, stack: error.stack });
    throw error;
  }
}

// Execute the enrichment process
async function runEnrichment() {
  if (!logger || !enrichmentService) {
    (logger || console).error('Enrichment cannot run: logger or enrichmentService not initialized.');
    return;
  }
  logger.info('Starting enrichment process...');
  try {
    const batchSize = config?.enrichment?.batchSize || 50;
    const results = await enrichmentService.enrichNewJobs(batchSize); // Use DI service
    logger.info(`Enrichment completed. Attempted: ${results.total_attempted || 0}.`);
    return results;
  } catch (error) {
    logger.error('Error in enrichment process', { error: error.message, stack: error.stack });
    throw error;
  }
}

// Execute the outreach process
async function runOutreach() {
  if (!logger || !outreachWorker) {
    (logger || console).error('Outreach cannot run: logger or outreachWorker not initialized.');
    return;
  }
  logger.info('Starting outreach process...');
  try {
    const batchSize = config?.outreach?.batchSize || 20;
    const results = await outreachWorker.processBatch({ batchSize }); // Use DI service
    logger.info(`Outreach completed. Queued ${results.successfully_queued || 0} emails.`);
    return results;
  } catch (error) {
    logger.error('Error in outreach process', { error: error.message, stack: error.stack });
    throw error;
  }
}

// Create simple HTTP server for health checks
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (parsedUrl.pathname === '/health') {
    try {
      const health = await healthCheck.runAllChecks();
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'warning' ? 200 : 503;
      
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'error', 
        message: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  } else if (parsedUrl.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'Job Pipeline API',
      version: require('./package.json').version,
      status: 'running',
      endpoints: {
        health: '/health',
        documentation: 'See README.md'
      }
    }, null, 2));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  logger.info(`Job Pipeline API server started on port ${PORT}`);
  logger.info(`Health check available at: http://localhost:${PORT}/health`);
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

// Main application logic
async function runJobPipeline() {
  try {
    logger.info('Starting job pipeline execution...');
    
    // Get services from container
    const scrapersService = container.resolve('scrapersService');
    const enrichmentService = container.resolve('enrichmentService');
    const outreachWorker = container.resolve('outreachWorker');
    
    // Example pipeline execution (this would typically be triggered by n8n or cron)
    logger.info('Job pipeline is ready. Services initialized successfully.');
    logger.info('Pipeline can be triggered via n8n workflow or manual execution.');
    
    // For demonstration, you could uncomment these lines to run the pipeline:
    // const scrapingResults = await scrapersService.scrapeAllJobTitles();
    // const enrichmentResults = await enrichmentService.enrichNewJobs();
    // const outreachResults = await outreachWorker.processEmailQueue();
    
  } catch (error) {
    logger.error('Error in job pipeline execution:', error);
    process.exit(1);
  }
}

// Start the pipeline
runJobPipeline().catch(error => {
  logger.error('Fatal error starting job pipeline:', error);
  process.exit(1);
});

module.exports = { server };
