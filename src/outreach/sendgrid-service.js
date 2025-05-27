/**
 * SendGrid integration for email outreach
 * Handles sending emails, rate limiting, and event tracking
 */

const sgMail = require('@sendgrid/mail');
const sgWebhook = require('@sendgrid/eventwebhook');
const { withRetries } = require('../utils/custom-retry');
// const config = require('../../config/config'); // Remove
// const db = require('../db'); // Remove
// const logger = require('../utils/logger'); // Remove
// const EmailValidator = require('../utils/email-validator'); // Remove

class SendGridService {
  constructor(config, logger, db, emailValidator) {
    this.config = config;
    this.logger = logger;
    this.db = db;
    this.emailValidator = emailValidator; // Store the instance

    this.apiKey = this.config.apiKeys.sendGrid;
    this.rateLimit = this.config.email.rateLimitPerMinute;
    this.fromEmail = this.config.email.fromEmail;
    this.fromName = this.config.email.fromName;
    this.templateId = this.config.email.templateId; // Ensure this is used or remove if not
    this.unsubscribeUrl = this.config.email.unsubscribeUrl;
    this.physicalAddress = this.config.email.physicalAddress;
    
    // Queue for rate limiting
    this.emailQueue = [];
    this.processing = false;
    
    // Initialize SendGrid if API key is available
    if (this.apiKey) {
      sgMail.setApiKey(this.apiKey);
      // Assuming sgWebhook.init is a global static initialization.
      // If it requires specific config (like webhook signing key), it should be passed.
      // For now, using apiKey as per original code.
      if (this.config.sendgridWebhookSigningKey) { // Example: use a specific signing key if available
         // sgWebhook.init(this.config.sendgridWebhookSigningKey); // This is hypothetical
         // The library @sendgrid/webhook's verifyEventAndTimestamp uses the key directly.
         // There isn't an `init` method on the library itself.
         // Webhook verification is usually done on the request object.
         // So, sgWebhook.init(this.apiKey) was likely a placeholder or misunderstanding.
         // We will remove sgWebhook.init() as it's not a standard SendGrid library feature for webhook setup this way.
         // Verification happens per request: const verified = sgWebhook.verifyEventAndTimestamp(publicKey, payload, signature, timestamp);
         this.logger.info('SendGrid service configured with API key. Webhook verification key available.');
      } else {
        this.logger.info('SendGrid service configured with API key. Webhook signing key not found in config, verification might be basic.');
      }
    } else {
      this.logger.warn('SendGrid API key not set. Email functionality will be disabled.');
    }
  }

  /**
   * Validate that the API key is set
   * @throws {Error} If API key is not set
   */
  validateApiKey() {
    if (!this.apiKey) {
      this.logger.error('SendGrid API key is not set. Attempted to use SendGrid without API key.');
      throw new Error('SendGrid API key is not set. Please set SENDGRID_API_KEY in your environment variables.');
    }
  }

  /**
   * Check if an email is on the unsubscribe list
   * @param {string} email - Email to check
   * @returns {Promise<boolean>} True if email is unsubscribed
   */
  async isUnsubscribed(email) {
    if (!email) return true; // Treat null/empty email as unsubscribed
    try {
      const query = 'SELECT * FROM unsubscribe_list WHERE email = $1';
      const result = await this.db.query(query, [email]);
      const isUnsub = result.rows.length > 0;
      this.logger.debug(`Unsubscribe check for ${email}: ${isUnsub}`);
      return isUnsub;
    } catch (error) {
      this.logger.error('Error checking unsubscribe status', { email, error: error.message, stack: error.stack });
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
   * @returns {Promise<Object|null>} Stored event record or null if error
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
      
      const result = await this.db.query(query, values);
      this.logger.debug(`Stored email event: ${eventType} for ${email}`, { jobId });
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error storing email event', { jobId, email, eventType, error: error.message, stack: error.stack });
      // throw error; // Original code throws, decide if this is desired. For now, let's return null.
      return null;
    }
  }

  /**
   * Process an incoming webhook event from SendGrid
   * @param {Object} event - SendGrid event object (single event from the batch)
   * @returns {Promise<Object|null>} Processed event record or null
   */
  async processWebhookEvent(event) { // This method processes a single event from the webhook payload
    try {
      const email = event.email;
      const eventType = event.event;
      // const timestamp = event.timestamp; // Available if needed
      const sgMessageId = event.sg_message_id;
      
      if (!sgMessageId) {
        this.logger.warn('SendGrid webhook event missing sg_message_id', { event });
        return null;
      }

      // Look up the job associated with this message ID from our 'sent' event
      const query = "SELECT job_id FROM email_events WHERE event_type = 'sent' AND (data->>'sg_message_id' = $1 OR data->>0 = $1 OR data->>'messageId' = $1) LIMIT 1";
      const result = await this.db.query(query, [sgMessageId]); // sg_message_id might be nested or direct
      
      if (result.rows.length === 0) {
        this.logger.warn(`No matching 'sent' email event found for message ID: ${sgMessageId}. Cannot associate webhook event.`, { eventType, email });
        // Optionally, store event without jobId if that's useful
        // await this.storeEmailEvent(null, email, eventType, event);
        return null;
      }
      
      const jobId = result.rows[0].job_id;
      
      // Store the new event
      const storedEvent = await this.storeEmailEvent(jobId, email, eventType, event);
      this.logger.info(`Processed webhook event ${eventType} for ${email} associated with job ${jobId}`);
      
      // Handle special event types
      if (eventType === 'unsubscribe' || eventType === 'bounce' || eventType === 'dropped' || eventType === 'spamreport') {
        const reason = eventType === 'unsubscribe' ? (event.reason || 'Unsubscribed via SendGrid event') : `SendGrid event: ${eventType}`;
        await this.db.query(
          'INSERT INTO unsubscribe_list (email, reason, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, updated_at = NOW()',
          [email, reason]
        );
        this.logger.info(`Added/Updated ${email} in unsubscribe list due to ${eventType} event for job ${jobId}`);
      }
      
      return storedEvent;
    } catch (error) {
      this.logger.error('Error processing SendGrid webhook event', { eventString: JSON.stringify(event), error: error.message, stack: error.stack });
      return null;
    }
  }

  /**
   * Prepare personalization data for an email template
   * @param {Object} job - Job data
   * @param {Object} contact - Contact data { email, firstName?, lastName? }
   * @returns {Object} Personalization data
   */
  preparePersonalizationData(job, contact) {
    const companyData = job.company_data ? 
      (typeof job.company_data === 'string' ? JSON.parse(job.company_data) : job.company_data) : 
      {}; // Ensure companyData is an object
    
    const companyName = companyData?.name || job.company || 'your company';
    
    let firstName = contact?.firstName;
    if (!firstName && job.contact_name) {
      const nameParts = job.contact_name.split(' ');
      if (nameParts.length > 0) firstName = nameParts[0];
    }
    if (!firstName) firstName = 'Hiring Manager'; // Fallback
    
    return {
      first_name: firstName,
      company: companyName,
      role: job.title || 'the role',
      location: job.location || 'not specified',
      job_url: job.job_url || '#', // Provide a fallback for URLs
      // Unsubscribe URL is now added directly in sendEmail to ensure it's always correct for the recipient
      // physical_address is also added in sendEmail
    };
  }

  /**
   * Add an email to the sending queue
   * @param {Object} emailData - Email data (to, subject, templateId, dynamicTemplateData, jobId)
   * @returns {Promise<void>}
   */
  async queueEmail(emailData) {
    this.validateApiKey(); // Ensures API key is set before queueing
    
    this.emailQueue.push(emailData);
    this.logger.debug(`Added email to ${emailData.to} to queue. Current queue size: ${this.emailQueue.length}`, { jobId: emailData.jobId });
    
    if (!this.processing) {
      this.processEmailQueue(); // No await here, it runs in background
    }
  }

  /**
   * Process the email queue with rate limiting
   * @returns {Promise<void>}
   */
  async processEmailQueue() {
    if (this.processing || this.emailQueue.length === 0) {
      if(this.processing) this.logger.debug("Queue processing already in progress.");
      return;
    }
    
    this.processing = true;
    this.logger.info(`Starting email queue processing. Queue size: ${this.emailQueue.length}`);
    
    try {
      const msPerEmail = (60 * 1000) / (this.rateLimit || 60); // Default to 60/min if rateLimit is 0 or undefined
      
      while (this.emailQueue.length > 0) {
        const emailData = this.emailQueue.shift();
        this.logger.debug(`Processing email to ${emailData.to} from queue. Remaining: ${this.emailQueue.length}`, { jobId: emailData.jobId });
        
        const unsubscribed = await this.isUnsubscribed(emailData.to);
        if (unsubscribed) {
          this.logger.info(`Skipping email to ${emailData.to} - address is on unsubscribe list or invalid.`, { jobId: emailData.jobId });
          await this.storeEmailEvent(emailData.jobId, emailData.to, 'skipped_unsubscribed', { subject: emailData.subject });
          continue;
        }
        
        try {
          // Pass all necessary parts of emailData to sendEmail
          // sendEmail expects an object like { to, subject, text, html, templateId, jobId }
          // and personalizations as a second argument
          const sendInput = {
            to: emailData.to,
            subject: emailData.subject,
            templateId: emailData.templateId, // This should be the actual SendGrid template ID
            jobId: emailData.jobId,
            // text and html will be generated by the template, but can be overridden
          };
          // The dynamicTemplateData from queueEmail is the personalizations for sendEmail
          const sentResponse = await this.sendEmail(sendInput, emailData.dynamicTemplateData);
          
          // storeEmailEvent for 'sent' is now handled within sendEmail itself after successful sgMail.send
          // No need to call it here explicitly unless sendEmail's behavior changes.
          this.logger.info(`Successfully sent email to ${emailData.to} for job ${emailData.jobId}. Message ID: ${sentResponse?.headers?.['x-message-id'] || 'N/A'}`);

        } catch (error) {
          // Error logging and storing 'error' event is handled within sendEmail
          this.logger.error(`Failed to send email to ${emailData.to} via queue for job ${emailData.jobId}. Error already logged by sendEmail.`, { errorMessage: error.message });
        }
        
        if (this.emailQueue.length > 0) {
            this.logger.debug(`Waiting ${msPerEmail}ms before next email.`);
            await new Promise(resolve => setTimeout(resolve, msPerEmail));
        }
      }
    } catch (error) {
        this.logger.error('Critical error in email queue processing loop.', { error: error.message, stack: error.stack });
    } finally {
      this.processing = false;
      this.logger.info("Email queue processing finished.");
    }
  }

  /**
   * Send an email using SendGrid with compliance checks
   * @param {Object} emailDetails - Email object { to, subject, text?, html?, templateId, jobId }
   * @param {Object} personalizations - Personalization data for the template (dynamic_template_data)
   * @returns {Promise<Object>} SendGrid API response (the first element of the array returned by sgMail.send)
   */
  async sendEmail(emailDetails, personalizations = {}) {
    this.validateApiKey();

    const { to, subject, text, html, templateId, jobId } = emailDetails;

    try {
      // 1. Validate subject line using the injected validator
      const subjectValidation = this.emailValidator.validateSubject(subject);
      if (!subjectValidation.isValid) {
        this.logger.warn('Email subject validation failed, but proceeding with send.', { 
          email: to, 
          subject: subject, 
          errors: subjectValidation.errors,
          jobId
        });
        // Original code continues sending, so we do too.
      }

      // 2. Check consent status using the injected validator
      const hasConsent = await this.emailValidator.hasValidConsent(to);
      if (!hasConsent) {
        this.logger.warn(`No valid consent for email: ${to}. Aborting send.`, { jobId });
        // Store 'skipped_no_consent' event
        await this.storeEmailEvent(jobId, to, 'skipped_no_consent', { subject });
        throw new Error(`No valid consent for email: ${to}`);
      }
      // Not calling logConsent here as per instructions to maintain original logic.
      // Consent should be logged when obtained, not at send time unless specifically required.

      // 3. Prepare email message for SendGrid
      const msg = {
        to: to,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject: subject,
        // text and html can be provided or will be generated by templateId
        ...(text && { text }),
        ...(html && { html }),
        ...(templateId && { templateId }), // Use the templateId from config or passed in
        personalizations: [{ // SendGrid expects personalizations array
          to: [{ email: to }],
          dynamic_template_data: {
            ...personalizations, // Data from preparePersonalizationData
            // Standard fields required by CAN-SPAM and good practice
            subject: subject, // Make subject available to template if needed
            unsubscribe_url: `${this.unsubscribeUrl}?email=${encodeURIComponent(to)}`, // Crucial for compliance
            physical_address: this.physicalAddress, // Crucial for compliance
            current_year: new Date().getFullYear() // For copyright in footer
          }
        }],
        headers: { // Custom headers
          'X-Job-ID': jobId ? jobId.toString() : 'N/A', // For tracking
          'List-Unsubscribe': `<${this.unsubscribeUrl}?email=${encodeURIComponent(to)}>` // Crucial for compliance
        },
        trackingSettings: {
          clickTracking: { enable: true, enableText: true },
          openTracking: { enable: true /*, substitutionTag: '%open-track%' // Optional */ },
          subscriptionTracking: { 
            enable: false // Using List-Unsubscribe header is generally preferred
            // If enabling, ensure html/text content for it is provided or use SendGrid's default.
            // text: 'If you would like to unsubscribe and stop receiving these emails, click here: %unsubscribe_url%',
            // html: '<p>If you would like to unsubscribe and stop receiving these emails, <a href="%unsubscribe_url%">click here</a>.</p>',
            // substitution_tag: '%unsubscribe_url%' // SendGrid uses this tag
          }
        }
      };
      
      // If not using a template, ensure text or html content is present
      if (!templateId && !text && !html) {
        this.logger.error('Email send attempt without templateId, text, or html content.', { to, subject, jobId });
        throw new Error('Email content is missing (no template, text, or html).');
      }


      // 4. Validate email content for compliance using the injected validator
      // Create a temporary object for content validation that includes generated parts if any
      const contentToValidate = { ...msg, html: html || "HTML content from template", text: text || "Text content from template" };
      const contentValidation = this.emailValidator.validateEmailContent(contentToValidate);
      if (!contentValidation.isValid) {
        this.logger.warn('Email content validation warnings, but proceeding with send.', { 
          email: to,
          warnings: contentValidation.warnings,
          jobId
        });
        // Original code tries to fix physical address if missing in text.
        // This is risky if HTML is primary. Better to ensure templates are compliant.
        // if (msg.text && !msg.text.includes(this.physicalAddress)) {
        //   msg.text += `\n\n${this.physicalAddress}`;
        // }
      }

      // 5. Send the email
      this.logger.debug(`Attempting to send email via SendGrid to: ${to} (will attempt retries if needed)`, { subject, jobId, templateId: msg.templateId });

      const apiCall = () => sgMail.send(msg);
      
      // Construct retry config from global config
      const serviceRetryOptions = { 
        ...this.config.retryConfig.default, 
        ...(this.config.retryConfig.services.sendGrid || {}) 
      };

      const retryConfigForWithRetries = {
        retries: serviceRetryOptions.retries,
        initialDelay: serviceRetryOptions.initialDelayMs,
        maxDelay: serviceRetryOptions.maxDelayMs,
        backoffFactor: serviceRetryOptions.backoffFactor,
        jitter: serviceRetryOptions.jitter
        // shouldRetry can be added here if defined in serviceRetryOptions.shouldRetry
      };

      // sgMail.send() returns a Promise for an array with a single response object
      // So, withRetries will return that array.
      const [response] = await withRetries(apiCall, retryConfigForWithRetries); 
      
      this.logger.info(`Email sent successfully to ${to} (after retries if any). Message ID: ${response.headers['x-message-id']}`, { jobId });
      
      // 6. Log the successful 'sent' event
      await this.storeEmailEvent(jobId, to, 'sent', { 
          sg_message_id: response.headers['x-message-id'],
          subject: subject,
          template_id: msg.templateId,
          status_code: response.statusCode
      });
      
      return response; // Return the full SendGrid response object
    } catch (error) {
      // This catch block now handles errors after all retries from withRetries are exhausted
      // or for non-retryable errors.
      this.logger.error('Error sending email via SendGrid (after all retries)', { 
        error: error.message, 
        errorCode: error.code, // SendGrid errors often have a code
        // SendGrid errors might have error.response.body.errors for detailed issues
        // errorBody: error.response && error.response.body ? error.response.body.errors : undefined,
        email: to,
        jobId,
        stack: error.stack 
      });
      
      // Log the failed attempt
      if (to) { // Ensure 'to' is defined
        await this.storeEmailEvent(
          jobId, 
          to, 
          'error', 
          { 
            error: error.message,
            code: error.code,
            // errorBody: error.response && error.response.body ? error.response.body.errors : undefined,
            subject: subject,
          }
        );
      }
      
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * Send an outreach email for a job
   * @param {Object} job - Job data
   * @returns {Promise<Object>} Send result (queued, skipped, or error)
   */
  async sendJobOutreach(job) {
    this.validateApiKey(); // Ensure API key is available
    
    if (!job.contact_email) {
      this.logger.warn(`Job ${job.id} has no contact email. Skipping outreach.`);
      await this.storeEmailEvent(job.id, null, 'skipped_no_email', { reason: 'No contact email' });
      return { skipped: true, reason: 'no_contact_email' };
    }
    
    const unsubscribed = await this.isUnsubscribed(job.contact_email);
    if (unsubscribed) {
      this.logger.info(`Skipping outreach for job ${job.id} - email ${job.contact_email} is on unsubscribe list or invalid.`);
      await this.storeEmailEvent(job.id, job.contact_email, 'skipped_unsubscribed', { reason: 'Email on unsubscribe list' });
      return { skipped: true, reason: 'email_unsubscribed' };
    }
    
    const contactParts = job.contact_name ? job.contact_name.split(' ') : [];
    const contact = {
      email: job.contact_email,
      firstName: contactParts.length > 0 ? contactParts[0] : null,
      // lastName: contactParts.length > 1 ? contactParts.slice(1).join(' ') : null // Not used by preparePersonalizationData
    };
    
    const dynamicTemplateData = this.preparePersonalizationData(job, contact);
    const subject = `Regarding the ${job.title} role at ${job.company || 'your company'}`; // Improved subject
    
    this.logger.info(`Queueing outreach email for job ${job.id} to ${contact.email}`);
    await this.queueEmail({
      to: contact.email,
      subject,
      templateId: this.templateId, // Use the class's default templateId
      dynamicTemplateData,
      jobId: job.id.toString() // Ensure jobId is a string if SendGrid metadata expects it
    });
    
    // Update job status to 'contact_queued' or similar
    try {
      await this.db.query(
        "UPDATE jobs SET status = 'contact_queued', outreach_attempts = COALESCE(outreach_attempts, 0) + 1, last_outreach_attempt_at = NOW(), updated_at = NOW() WHERE id = $1",
        [job.id]
      );
      this.logger.info(`Updated job ${job.id} status to 'contact_queued'.`);
    } catch (dbError) {
      this.logger.error(`Failed to update job ${job.id} status after queueing email.`, { error: dbError.message, stack: dbError.stack });
      // Continue, as email is queued.
    }
    
    return { queued: true, email: contact.email, subject };
  }

  /**
   * Process outreach for all jobs ready for contact
   * @param {number} batchSize - Number of jobs to process per batch
   * @returns {Promise<Object>} Processing results
   */
  async processOutreachBatch(batchSize = 10) {
    this.validateApiKey();
    
    try {
      // Get jobs that are 'enriched' or 'enrichment_partial' and ready for outreach
      // Also consider jobs that previously failed outreach but might be retried (e.g., after a delay or config change)
      // For simplicity, focusing on 'enriched' status for now.
      const query = `
        SELECT * FROM jobs 
        WHERE contact_email IS NOT NULL
        AND (status = 'enriched' OR status = 'enrichment_partial' OR status = 'enriched_unverified_email') 
        AND (outreach_attempts IS NULL OR outreach_attempts < ${this.config.email.maxOutreachAttempts || 3})
        ORDER BY updated_at ASC -- Process older enriched jobs first
        LIMIT $1
      `;
      
      const result = await this.db.query(query, [batchSize]);
      const jobs = result.rows;
      
      this.logger.info(`Found ${jobs.length} jobs for outreach batch.`);
      
      const outreachResults = {
        total_processed_in_batch: jobs.length,
        successfully_queued: 0,
        skipped_unsubscribed: 0,
        skipped_no_email:0, // Should not happen with query, but good to track
        failed_to_queue: 0, // Errors during sendJobOutreach before queueing
        details: []
      };
      
      for (const job of jobs) {
        try {
          const sendResult = await this.sendJobOutreach(job);
          
          if (sendResult.queued) {
            outreachResults.successfully_queued++;
          } else if (sendResult.skipped) {
            if (sendResult.reason === 'email_unsubscribed') outreachResults.skipped_unsubscribed++;
            else if (sendResult.reason === 'no_contact_email') outreachResults.skipped_no_email++;
          }
          outreachResults.details.push({ jobId: job.id, status: sendResult.queued ? 'queued' : (sendResult.skipped_reason || 'skipped_other'), email: job.contact_email });
        } catch (error) {
          this.logger.error(`Error processing outreach for job ${job.id} in batch`, { error: error.message, stack: error.stack });
          outreachResults.failed_to_queue++;
          outreachResults.details.push({ jobId: job.id, status: 'failed_to_queue', error: error.message, email: job.contact_email });
           // Optionally update job status to 'outreach_failed' here
           try {
            await this.db.query("UPDATE jobs SET status = 'outreach_failed', updated_at = NOW() WHERE id = $1", [job.id]);
          } catch (dbError) {
            this.logger.error(`Failed to update job ${job.id} status to outreach_failed.`, { error: dbError.message });
          }
        }
      }
      
      this.logger.info(`Outreach batch completed. Processed: ${outreachResults.total_processed_in_batch}, Queued: ${outreachResults.successfully_queued}, Skipped (Unsub): ${outreachResults.skipped_unsubscribed}, Failed: ${outreachResults.failed_to_queue}`);
      return outreachResults;
    } catch (error) {
      this.logger.error('Critical error in outreach batch processing', { error: error.message, stack: error.stack });
      throw error; // Rethrow for higher-level handling
    }
  }
}

module.exports = (config, logger, db, emailValidator) => {
  return new SendGridService(config, logger, db, emailValidator);
};
