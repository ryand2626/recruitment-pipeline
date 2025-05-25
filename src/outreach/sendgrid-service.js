/**
 * SendGrid integration for email outreach
 * Handles sending emails, rate limiting, and event tracking
 */

const sgMail = require('@sendgrid/mail');
const sgWebhook = require('@sendgrid/webhook');
const config = require('../../config/config');
const db = require('../db');
const logger = require('../utils/logger');
const EmailValidator = require('../utils/email-validator');

class SendGridService {
  constructor() {
    this.apiKey = config.apiKeys.sendGrid;
    this.rateLimit = config.email.rateLimitPerMinute;
    this.fromEmail = config.email.fromEmail;
    this.fromName = config.email.fromName;
    this.templateId = config.email.templateId;
    this.unsubscribeUrl = config.email.unsubscribeUrl;
    this.physicalAddress = config.email.physicalAddress;
    
    // Queue for rate limiting
    this.emailQueue = [];
    this.processing = false;
    
    // Initialize SendGrid if API key is available
    if (this.apiKey) {
      sgMail.setApiKey(this.apiKey);
      sgWebhook.init(this.apiKey);
      logger.info('SendGrid service initialized');
    } else {
      logger.warn('SendGrid API key not set. Email functionality will be disabled.');
    }
  }

  /**
   * Validate that the API key is set
   * @throws {Error} If API key is not set
   */
  validateApiKey() {
    if (!this.apiKey) {
      throw new Error('SendGrid API key is not set. Please set SENDGRID_API_KEY in your environment variables.');
    }
  }

  /**
   * Check if an email is on the unsubscribe list
   * @param {string} email - Email to check
   * @returns {Promise<boolean>} True if email is unsubscribed
   */
  async isUnsubscribed(email) {
    try {
      const query = 'SELECT * FROM unsubscribe_list WHERE email = $1';
      const result = await db.query(query, [email]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking unsubscribe status', { email, error: error.message });
      // If there's an error, we'll assume the email is unsubscribed to be safe
      return true;
    }
  }

  /**
   * Store an email event in the database
   * @param {string} jobId - ID of the job associated with the email
   * @param {string} email - Recipient email address
   * @param {string} eventType - Type of event (sent, delivered, opened, clicked, bounced, etc.)
   * @param {Object} data - Additional event data
   * @returns {Promise<Object>} Stored event record
   */
  async storeEmailEvent(jobId, email, eventType, data = {}) {
    try {
      const query = `
        INSERT INTO email_events (job_id, email, event_type, data)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      
      const values = [
        jobId,
        email,
        eventType,
        JSON.stringify(data)
      ];
      
      const result = await db.query(query, values);
      logger.debug(`Stored email event: ${eventType} for ${email}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error storing email event', { jobId, email, eventType, error: error.message });
      throw error;
    }
  }

  /**
   * Process an incoming webhook event from SendGrid
   * @param {Object} event - SendGrid event object
   * @returns {Promise<Object>} Processed event
   */
  async processWebhookEvent(event) {
    try {
      // Extract relevant information from the event
      const email = event.email;
      const eventType = event.event;
      const timestamp = event.timestamp;
      const sgMessageId = event.sg_message_id;
      
      // Look up the job associated with this message ID
      const query = "SELECT * FROM email_events WHERE data->>\"sg_message_id\" = $1 LIMIT 1";
      const result = await db.query(query, [sgMessageId]);
      
      if (result.rows.length === 0) {
        logger.warn(`No matching email event found for message ID: ${sgMessageId}`);
        return null;
      }
      
      const originalEvent = result.rows[0];
      const jobId = originalEvent.job_id;
      
      // Store the new event
      const storedEvent = await this.storeEmailEvent(jobId, email, eventType, event);
      
      // Handle special event types
      if (eventType === 'unsubscribe') {
        // Add to unsubscribe list
        await db.query(
          'INSERT INTO unsubscribe_list (email, reason) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
          [email, 'Unsubscribed via SendGrid event']
        );
        
        logger.info(`Added ${email} to unsubscribe list due to explicit unsubscribe`);
      } else if (eventType === 'bounce' || eventType === 'dropped' || eventType === 'spamreport') {
        // Add to unsubscribe list for these negative events as well
        await db.query(
          'INSERT INTO unsubscribe_list (email, reason) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
          [email, `Added due to ${eventType} event`]
        );
        
        logger.info(`Added ${email} to unsubscribe list due to ${eventType} event`);
      }
      
      return storedEvent;
    } catch (error) {
      logger.error('Error processing webhook event', { event, error: error.message });
      return null;
    }
  }

  /**
   * Prepare personalization data for an email template
   * @param {Object} job - Job data
   * @param {Object} contact - Contact data
   * @returns {Object} Personalization data
   */
  preparePersonalizationData(job, contact) {
    // Extract company data if available
    const companyData = job.company_data ? 
      (typeof job.company_data === 'string' ? JSON.parse(job.company_data) : job.company_data) : 
      null;
    
    const companyName = companyData?.name || job.company || 'your company';
    
    // Extract first name from contact or use fallback
    let firstName = 'Hiring Manager';
    if (contact && contact.firstName) {
      firstName = contact.firstName;
    } else if (job.contact_name) {
      const nameParts = job.contact_name.split(' ');
      if (nameParts.length > 0) {
        firstName = nameParts[0];
      }
    }
    
    return {
      first_name: firstName,
      company: companyName,
      role: job.title,
      location: job.location || 'your location',
      job_url: job.job_url || '',
      unsubscribe_url: `${this.unsubscribeUrl}?email=${contact.email}`,
      physical_address: this.physicalAddress
    };
  }

  /**
   * Add an email to the sending queue
   * @param {Object} emailData - Email data
   * @returns {Promise<void>}
   */
  async queueEmail(emailData) {
    this.validateApiKey();
    
    // Add email to queue
    this.emailQueue.push(emailData);
    logger.debug(`Added email to ${emailData.to} to queue. Current queue size: ${this.emailQueue.length}`);
    
    // Start processing queue if not already processing
    if (!this.processing) {
      this.processEmailQueue();
    }
  }

  /**
   * Process the email queue with rate limiting
   * @returns {Promise<void>}
   */
  async processEmailQueue() {
    if (this.processing || this.emailQueue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    try {
      // Calculate time per email based on rate limit
      const msPerEmail = (60 * 1000) / this.rateLimit;
      
      // Process emails at the specified rate
      while (this.emailQueue.length > 0) {
        const emailData = this.emailQueue.shift();
        
        // Check if email is unsubscribed
        const unsubscribed = await this.isUnsubscribed(emailData.to);
        if (unsubscribed) {
          logger.info(`Skipping email to ${emailData.to} - address is on unsubscribe list`);
          continue;
        }
        
        try {
          const result = await this.sendEmail(emailData);
          logger.info(`Sent email to ${emailData.to}`);
          
          // Store the send event
          await this.storeEmailEvent(
            emailData.jobId, 
            emailData.to, 
            'sent', 
            { 
              sg_message_id: result[0].messageId,
              subject: emailData.subject,
              template_id: emailData.templateId
            }
          );
        } catch (error) {
          logger.error(`Error sending email to ${emailData.to}`, { error: error.message });
        }
        
        // Wait for the calculated time before sending next email
        await new Promise(resolve => setTimeout(resolve, msPerEmail));
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Send an email using SendGrid with compliance checks
   * @param {Object} email - Email object with to, subject, text, html, etc.
   * @param {Object} personalizations - Personalization data for the template
   * @returns {Promise<Object>} SendGrid response
   */
  async sendEmail(email, personalizations = {}) {
    this.validateApiKey();

    try {
      // 1. Validate subject line
      const subjectValidation = EmailValidator.validateSubject(email.subject);
      if (!subjectValidation.isValid) {
        logger.warn('Email subject validation failed', { 
          email: email.to, 
          subject: email.subject, 
          errors: subjectValidation.errors 
        });
        // Continue sending but log the warning
      }

      // 2. Check consent status
      const hasConsent = await EmailValidator.hasValidConsent(email.to);
      if (!hasConsent) {
        throw new Error(`No valid consent for email: ${email.to}`);
      }

      // 3. Prepare and validate email content
      const msg = {
        to: email.to,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject: email.subject,
        text: email.text,
        html: email.html,
        templateId: this.templateId,
        personalizations: [{
          to: [{ email: email.to }],
          dynamic_template_data: {
            ...personalizations,
            unsubscribe_url: `${this.unsubscribeUrl}?email=${encodeURIComponent(email.to)}`,
            physical_address: this.physicalAddress,
            // Add current year for footer
            current_year: new Date().getFullYear()
          }
        }],
        // Add headers for DMARC compliance
        headers: {
          'X-Entity-Ref-ID': `msg-${Date.now()}`,
          'List-Unsubscribe': `<${this.unsubscribeUrl}?email=${encodeURIComponent(email.to)}>`
        },
        // Add tracking settings
        trackingSettings: {
          clickTracking: {
            enable: true,
            enableText: true
          },
          openTracking: {
            enable: true,
            substitutionTag: '%open-track%'
          },
          subscriptionTracking: {
            enable: true,
            substitutionTag: '%unsubscribe%',
            text: 'If you would like to unsubscribe and stop receiving these emails, click here: %unsubscribe%',
            html: '<p>If you would like to unsubscribe and stop receiving these emails, <a href="%unsubscribe%">click here</a>.</p>'
          }
        }
      };

      // 4. Validate email content for compliance
      const contentValidation = EmailValidator.validateEmailContent(msg);
      if (!contentValidation.isValid) {
        logger.warn('Email content validation warnings', { 
          email: email.to,
          warnings: contentValidation.warnings 
        });
        // Ensure physical address is in the email
        if (msg.text && !msg.text.includes(this.physicalAddress)) {
          msg.text += `\n\n${this.physicalAddress}`;
        }
      }

      // 5. Send the email
      const [response] = await sgMail.send(msg);
      
      // 6. Log the successful send
      await this.storeEmailEvent(email.jobId, email.to, 'sent', response);
      
      return response;
    } catch (error) {
      logger.error('Error sending email', { 
        error: error.message, 
        email: email?.to,
        stack: error.stack 
      });
      
      // Log the failed attempt
      if (email?.to) {
        await this.storeEmailEvent(
          email.jobId, 
          email.to, 
          'error', 
          { 
            error: error.message,
            code: error.code,
            statusCode: error.response?.statusCode
          }
        );
      }
      
      throw error;
    }
  }

  /**
   * Send an outreach email for a job
   * @param {Object} job - Job data
   * @returns {Promise<Object>} Send result
   */
  async sendJobOutreach(job) {
    this.validateApiKey();
    
    if (!job.contact_email) {
      throw new Error(`Job ${job.id} has no contact email`);
    }
    
    // Check if email is unsubscribed
    const unsubscribed = await this.isUnsubscribed(job.contact_email);
    if (unsubscribed) {
      logger.info(`Skipping outreach for job ${job.id} - email ${job.contact_email} is on unsubscribe list`);
      return {
        skipped: true,
        reason: 'email_unsubscribed'
      };
    }
    
    // Prepare contact object
    const contactParts = job.contact_name ? job.contact_name.split(' ') : [];
    const contact = {
      email: job.contact_email,
      firstName: contactParts.length > 0 ? contactParts[0] : null,
      lastName: contactParts.length > 1 ? contactParts.slice(1).join(' ') : null
    };
    
    // Prepare email data
    const dynamicTemplateData = this.preparePersonalizationData(job, contact);
    
    // Create a subject line based on the job title
    const subject = `Qualified candidate for your ${job.title} role`;
    
    // Queue the email
    await this.queueEmail({
      to: contact.email,
      subject,
      templateId: this.templateId,
      dynamicTemplateData,
      jobId: job.id
    });
    
    // Update job status to 'contacted'
    await db.query(
      'UPDATE jobs SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['contacted', job.id]
    );
    
    return {
      queued: true,
      email: contact.email,
      subject
    };
  }

  /**
   * Process outreach for all jobs ready for contact
   * @param {number} batchSize - Number of jobs to process per batch
   * @returns {Promise<Object>} Processing results
   */
  async processOutreachBatch(batchSize = 10) {
    this.validateApiKey();
    
    try {
      // Get jobs that have contact info but haven't been contacted yet
      const query = `
        SELECT * FROM jobs 
        WHERE contact_email IS NOT NULL
        AND status = 'new'
        LIMIT $1
      `;
      
      const result = await db.query(query, [batchSize]);
      const jobs = result.rows;
      
      logger.info(`Found ${jobs.length} jobs ready for outreach`);
      
      const outreachResults = {
        total: jobs.length,
        queued: 0,
        skipped: 0,
        failed: 0,
        jobs: []
      };
      
      for (const job of jobs) {
        try {
          const sendResult = await this.sendJobOutreach(job);
          
          if (sendResult.queued) {
            outreachResults.queued++;
          } else if (sendResult.skipped) {
            outreachResults.skipped++;
          }
          
          outreachResults.jobs.push({
            id: job.id,
            title: job.title,
            company: job.company,
            contact_email: job.contact_email,
            result: sendResult
          });
        } catch (error) {
          logger.error(`Error processing outreach for job ${job.id}`, { error: error.message });
          outreachResults.failed++;
          
          outreachResults.jobs.push({
            id: job.id,
            title: job.title,
            company: job.company,
            error: error.message
          });
        }
      }
      
      logger.info(`Completed outreach process. Queued: ${outreachResults.queued}, Skipped: ${outreachResults.skipped}, Failed: ${outreachResults.failed}`);
      return outreachResults;
    } catch (error) {
      logger.error('Error in outreach process', { error: error.message });
      throw error;
    }
  }
}

module.exports = new SendGridService();
