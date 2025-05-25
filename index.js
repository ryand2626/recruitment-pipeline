/**
 * Jobs Pipeline - Main Application Entry Point
 * Orchestrates the scraping, enrichment, and outreach processes
 */

const express = require('express');
const cron = require('node-cron');
const scrapers = require('./src/scrapers');
const enrichmentService = require('./src/enrichment');
const outreachWorker = require('./src/outreach');
const logger = require('./src/utils/logger');

// Create Express app for webhook handling
const app = express();
const port = process.env.WEBHOOK_PORT || 3000;

// Parse JSON request bodies
app.use(express.json());

// Initialize the application
async function init() {
  try {
    logger.info('Initializing Jobs Pipeline application');
    
    // Start webhook server for handling email events
    app.listen(port, () => {
      logger.info(`Webhook server listening on port ${port}`);
    });
    
    // Set up routes
    setupRoutes();
    
    // Set up scheduled jobs
    setupScheduledJobs();
    
    logger.info('Jobs Pipeline application initialized successfully');
  } catch (error) {
    logger.error('Error initializing application', { error: error.message });
    process.exit(1);
  }
}

// Set up Express routes
function setupRoutes() {
  // SendGrid webhook endpoint
  app.post('/webhook/sendgrid', async (req, res) => {
    try {
      const events = req.body;
      
      if (!Array.isArray(events)) {
        logger.warn('Received non-array webhook data', { data: events });
        return res.status(400).send('Expected array of events');
      }
      
      logger.info(`Received ${events.length} SendGrid webhook events`);
      
      // Process events in the background
      Promise.all(events.map(event => outreachWorker.sendgridService.processWebhookEvent(event)))
        .catch(error => logger.error('Error processing webhook events', { error: error.message }));
      
      // Respond immediately to SendGrid
      return res.status(200).send({
        received: events.length,
        processing: true
      });
    } catch (error) {
      logger.error('Error handling SendGrid webhook', { error: error.message });
      return res.status(500).send('Internal server error');
    }
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });
  
  // Scraping trigger endpoint (manually trigger scraping)
  app.post('/trigger/scrape', async (req, res) => {
    try {
      logger.info('Manual scraping triggered');
      
      // Start scraping in the background
      runScraping()
        .then(results => {
          logger.info('Manual scraping completed', { results });
        })
        .catch(error => {
          logger.error('Error in manual scraping', { error: error.message });
        });
      
      return res.status(200).send({
        status: 'started',
        message: 'Scraping process started in the background'
      });
    } catch (error) {
      logger.error('Error triggering manual scraping', { error: error.message });
      return res.status(500).send('Internal server error');
    }
  });
  
  // Enrichment trigger endpoint (manually trigger enrichment)
  app.post('/trigger/enrich', async (req, res) => {
    try {
      logger.info('Manual enrichment triggered');
      
      // Start enrichment in the background
      runEnrichment()
        .then(results => {
          logger.info('Manual enrichment completed', { results });
        })
        .catch(error => {
          logger.error('Error in manual enrichment', { error: error.message });
        });
      
      return res.status(200).send({
        status: 'started',
        message: 'Enrichment process started in the background'
      });
    } catch (error) {
      logger.error('Error triggering manual enrichment', { error: error.message });
      return res.status(500).send('Internal server error');
    }
  });
  
  // Outreach trigger endpoint (manually trigger outreach)
  app.post('/trigger/outreach', async (req, res) => {
    try {
      logger.info('Manual outreach triggered');
      
      // Start outreach in the background
      runOutreach()
        .then(results => {
          logger.info('Manual outreach completed', { results });
        })
        .catch(error => {
          logger.error('Error in manual outreach', { error: error.message });
        });
      
      return res.status(200).send({
        status: 'started',
        message: 'Outreach process started in the background'
      });
    } catch (error) {
      logger.error('Error triggering manual outreach', { error: error.message });
      return res.status(500).send('Internal server error');
    }
  });
}

// Set up scheduled jobs using node-cron
function setupScheduledJobs() {
  // Schedule scraping job - Run every day at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    logger.info('Running scheduled scraping job');
    
    try {
      await runScraping();
      logger.info('Scheduled scraping job completed');
    } catch (error) {
      logger.error('Error in scheduled scraping job', { error: error.message });
    }
  });
  
  // Schedule enrichment job - Run every day at 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    logger.info('Running scheduled enrichment job');
    
    try {
      await runEnrichment();
      logger.info('Scheduled enrichment job completed');
    } catch (error) {
      logger.error('Error in scheduled enrichment job', { error: error.message });
    }
  });
  
  // Schedule outreach job - Run every day at 8:00 AM (ET) - Adjusted for server time
  cron.schedule('0 8 * * *', async () => {
    logger.info('Running scheduled outreach job');
    
    try {
      await runOutreach();
      logger.info('Scheduled outreach job completed');
    } catch (error) {
      logger.error('Error in scheduled outreach job', { error: error.message });
    }
  });
}

// Execute the scraping process
async function runScraping() {
  logger.info('Starting scraping process');
  
  try {
    // Run both SerpAPI and Playwright scrapers
    const results = await scrapers.runAllScrapers();
    
    logger.info(`Scraping completed. Added ${results.total} jobs in total.`);
    return results;
  } catch (error) {
    logger.error('Error in scraping process', { error: error.message });
    throw error;
  }
}

// Execute the enrichment process
async function runEnrichment() {
  logger.info('Starting enrichment process');
  
  try {
    // Process a batch of jobs (50 at a time)
    const results = await enrichmentService.enrichNewJobs(50);
    
    logger.info(`Enrichment completed. Processed ${results.total} jobs.`);
    return results;
  } catch (error) {
    logger.error('Error in enrichment process', { error: error.message });
    throw error;
  }
}

// Execute the outreach process
async function runOutreach() {
  logger.info('Starting outreach process');
  
  try {
    // Process a batch of jobs (20 at a time)
    const results = await outreachWorker.processBatch({ batchSize: 20 });
    
    logger.info(`Outreach completed. Queued ${results.queued} emails.`);
    return results;
  } catch (error) {
    logger.error('Error in outreach process', { error: error.message });
    throw error;
  }
}

// Run the application
init().catch(error => {
  logger.error('Fatal error initializing application', { error: error.message });
  process.exit(1);
});
