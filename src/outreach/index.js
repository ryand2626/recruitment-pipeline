/**
 * Outreach Worker
 * Coordinates the email outreach process, including sending emails and handling events
 */

const express = require('express');
const bodyParser = require('body-parser');
const sendgridService = require('./sendgrid-service');
const db = require('../db');
const logger = require('../utils/logger');

class OutreachWorker {
  constructor() {
    this.sendgridService = sendgridService;
  }

  /**
   * Initialize webhook server for handling email events
   * @param {number} port - Port to listen on
   * @returns {Promise<Object>} Express server
   */
  async initWebhookServer(port = 3000) {
    const app = express();
    
    // Parse JSON bodies
    app.use(bodyParser.json());
    
    // Handle SendGrid webhook events
    app.post('/webhook/sendgrid', async (req, res) => {
      try {
        const events = req.body;
        
        if (!Array.isArray(events)) {
          logger.warn('Received non-array webhook data', { data: events });
          return res.status(400).send('Expected array of events');
        }
        
        logger.info(`Received ${events.length} SendGrid webhook events`);
        
        // Process each event
        const results = await Promise.all(
          events.map(event => this.sendgridService.processWebhookEvent(event))
        );
        
        return res.status(200).send({
          received: events.length,
          processed: results.filter(r => r !== null).length
        });
      } catch (error) {
        logger.error('Error processing webhook events', { error: error.message });
        return res.status(500).send('Error processing webhook events');
      }
    });
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).send('OK');
    });
    
    // Start the server
    return new Promise((resolve, reject) => {
      const server = app.listen(port, () => {
        logger.info(`Webhook server listening on port ${port}`);
        resolve(server);
      });
      
      server.on('error', (error) => {
        logger.error('Error starting webhook server', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Process a batch of jobs for outreach
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing results
   */
  async processBatch(options = {}) {
    const batchSize = options.batchSize || 10;
    
    try {
      logger.info(`Starting outreach batch with size: ${batchSize}`);
      
      // Process outreach
      const results = await this.sendgridService.processOutreachBatch(batchSize);
      
      logger.info(`Completed outreach batch. Queued: ${results.queued}, Skipped: ${results.skipped}, Failed: ${results.failed}`);
      
      return results;
    } catch (error) {
      logger.error('Error processing outreach batch', { error: error.message });
      throw error;
    }
  }

  /**
   * Create an email template in SendGrid (This would typically be done manually in the SendGrid UI)
   * This is a placeholder implementation to document the expected template structure
   */
  async createEmailTemplate() {
    // This is a placeholder for documentation purposes
    // In reality, you would create the template in the SendGrid UI
    
    // The template should include the following dynamic fields:
    // - {{first_name}} - Contact's first name
    // - {{company}} - Company name
    // - {{role}} - Job role/title
    // - {{location}} - Job location
    // - {{job_url}} - URL to the job posting
    // - {{unsubscribe_url}} - URL for unsubscribing
    // - {{physical_address}} - Physical address for CAN-SPAM compliance
    
    logger.info('Email template needs to be created manually in SendGrid UI');
    
    // Example template HTML structure:
    const templateHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Job Application</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <p>Hi {{first_name}},</p>
        
        <p>I hope this email finds you well. I noticed that {{company}} is hiring for the {{role}} position in {{location}}, and I wanted to reach out directly.</p>
        
        <p>I have a candidate with the perfect background for this role, and I'd be happy to make an introduction. They have experience in investment banking and M&A, with a track record of successful deals.</p>
        
        <p>Would you be available for a quick 15-minute call this week to discuss how my candidate could add value to your team?</p>
        
        <p>Best regards,<br>
        [Your Name]<br>
        [Your Title]<br>
        [Your Company]</p>
        
        <div style="margin-top: 30px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
          <p>If you're not the right person to contact about this, I'd appreciate if you could forward this to the appropriate person.</p>
          <p><a href="{{job_url}}">View the job posting</a></p>
          <p><a href="{{unsubscribe_url}}">Unsubscribe</a> from future emails.</p>
          <p>{{physical_address}}</p>
        </div>
      </div>
    </body>
    </html>
    `;
    
    return {
      created: false,
      message: 'Template needs to be created manually in SendGrid UI',
      templateExample: templateHtml
    };
  }
}

// If this file is run directly, start the worker
if (require.main === module) {
  (async () => {
    try {
      logger.info('Starting outreach worker');
      
      const worker = new OutreachWorker();
      
      // Initialize webhook server
      await worker.initWebhookServer(process.env.WEBHOOK_PORT || 3000);
      
      // Process a batch
      await worker.processBatch();
      
      logger.info('Outreach worker completed initial batch');
    } catch (error) {
      logger.error('Error in outreach worker', { error: error.message });
      process.exit(1);
    }
  })();
}

module.exports = new OutreachWorker();
