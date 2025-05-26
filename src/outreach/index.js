/**
 * Outreach Worker
 * Coordinates the email outreach process, including sending emails and handling events
 */

const express = require('express');
const bodyParser = require('body-parser');
// const sendgridService = require('./sendgrid-service'); // Remove
// const db = require('../db'); // Remove (if only sendgridService used it, it's already injected there)
// const logger = require('../utils/logger'); // Remove

class OutreachWorker {
  constructor(sendgridService, logger, config) {
    this.sendgridService = sendgridService;
    this.logger = logger;
    this.config = config; // For WEBHOOK_PORT and other configs
  }

  /**
   * Initialize webhook server for handling email events
   * @param {number} port - Optional port to listen on, overrides config if provided
   * @returns {Promise<Object>} Express server
   */
  async initWebhookServer(port) {
    // Use provided port or fallback to config, then default
    const actualPort = port || (this.config && this.config.ports && this.config.ports.webhook) || 3000;
    const app = express();
    
    // Parse JSON bodies
    app.use(bodyParser.json());
    
    // Handle SendGrid webhook events
    app.post('/webhook/sendgrid', async (req, res) => {
      try {
        const events = req.body; // SendGrid sends events in an array
        
        if (!Array.isArray(events)) {
          this.logger.warn('Received non-array webhook data from SendGrid', { data: events });
          return res.status(400).send('Expected array of events');
        }
        
        this.logger.info(`Received ${events.length} SendGrid webhook events`);
        
        // Process each event
        // Using Promise.allSettled to ensure all events are attempted even if some fail
        const results = await Promise.allSettled(
          events.map(event => this.sendgridService.processWebhookEvent(event))
        );
        
        const processedCount = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
        const failedCount = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null)).length;

        this.logger.info(`Webhook processing complete. Processed: ${processedCount}, Failed/Skipped: ${failedCount}`);
        
        // SendGrid expects a 2xx response to acknowledge receipt.
        // Even if some events failed processing on our end, we received them.
        return res.status(200).send({
          message: "Events received",
          received: events.length,
          successfully_processed: processedCount,
          failed_or_skipped_processing: failedCount
        });
      } catch (error) { // Catch errors from body parsing or other unexpected issues
        this.logger.error('Critical error processing SendGrid webhook events batch', { error: error.message, stack: error.stack });
        return res.status(500).send('Error processing webhook events');
      }
    });
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      this.logger.debug('Health check endpoint hit.');
      res.status(200).send('OK');
    });
    
    // Start the server
    return new Promise((resolve, reject) => {
      const server = app.listen(actualPort, () => {
        this.logger.info(`Webhook server listening on port ${actualPort}`);
        resolve(server);
      });
      
      server.on('error', (error) => {
        this.logger.error('Error starting webhook server', { port: actualPort, error: error.message, stack: error.stack });
        reject(error);
      });
    });
  }

  /**
   * Process a batch of jobs for outreach
   * @param {Object} options - Processing options (e.g., batchSize)
   * @returns {Promise<Object>} Processing results
   */
  async processBatch(options = {}) {
    // Use batchSize from options, then config, then default
    const batchSize = options.batchSize || (this.config && this.config.outreach && this.config.outreach.batchSize) || 10;
    
    try {
      this.logger.info(`Starting outreach batch processing with size: ${batchSize}`);
      
      if (!this.sendgridService) {
        this.logger.error('SendGrid service is not available. Cannot process outreach batch.');
        throw new Error('SendGrid service not initialized or provided.');
      }
      
      // Process outreach using the injected sendgridService
      const results = await this.sendgridService.processOutreachBatch(batchSize);
      
      this.logger.info(`Outreach batch processing completed. Successfully Queued: ${results.successfully_queued}, Skipped (Unsub): ${results.skipped_unsubscribed}, Failed to Queue: ${results.failed_to_queue}`);
      
      return results;
    } catch (error) {
      this.logger.error('Error processing outreach batch', { error: error.message, stack: error.stack });
      // Depending on desired behavior, you might want to re-throw or handle specific errors
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
    // - {{unsubscribe_url}} - URL for unsubscribing (passed in dynamic_template_data)
    // - {{physical_address}} - Physical address for CAN-SPAM compliance (passed in dynamic_template_data)
    // - {{current_year}} - For copyright (passed in dynamic_template_data)
    
    this.logger.info('Email template creation should be done manually in the SendGrid UI. This function is for documentation.');
    
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
          <p>To unsubscribe from future emails, please <a href="{{unsubscribe_url}}">click here</a>.</p>
          <p>{{physical_address}}</p>
          <p>&copy; {{current_year}} [Your Company]. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
    `;
    
    return {
      created: false,
      message: 'Template needs to be created manually in SendGrid UI or via API if SendGrid client library is used more extensively.',
      templateExample: templateHtml
    };
  }
}

module.exports = (sendgridService, logger, config) => {
  return new OutreachWorker(sendgridService, logger, config);
};
