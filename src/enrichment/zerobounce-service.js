/**
 * ZeroBounce API integration for email validation
 * Verifies email addresses and rejects catch-all or invalid addresses
 */

const axios = require('axios');
// const config = require('../../config/config'); // Remove
// const logger = require('../utils/logger');   // Remove

class ZeroBounceService {
  constructor(config, logger) {
    this.apiKey = config.apiKeys.zeroBounce;
    this.baseUrl = 'https://api.zerobounce.net/v2'; // Corrected base URL based on usage
    this.logger = logger;
    this.config = config; // Store config if other parts of it are needed
  }

  /**
   * Validate that the API key is set
   * @throws {Error} If API key is not set
   */
  validateApiKey() {
    if (!this.apiKey) {
      this.logger.error('ZeroBounce API key is not set. Please set ZEROBOUNCE_API_KEY in your environment variables.');
      throw new Error('ZeroBounce API key is not set. Please set ZEROBOUNCE_API_KEY in your environment variables.');
    }
  }

  /**
   * Check API credits
   * @returns {Promise<Object>} Credit information
   */
  async getCredits() {
    this.validateApiKey();
    
    try {
      const response = await axios.get(`${this.baseUrl}/getcredits`, {
        params: {
          api_key: this.apiKey
        }
      });
      
      if (response.status !== 200) {
        this.logger.error(`ZeroBounce API /getcredits returned status code ${response.status}`);
        throw new Error(`ZeroBounce API returned status code ${response.status}`);
      }
      
      this.logger.debug(`ZeroBounce credits remaining: ${response.data.Credits}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error checking ZeroBounce credits', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Validate an email address
   * @param {string} email - Email address to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateEmail(email) {
    this.validateApiKey();
    
    if (!email || !email.includes('@')) {
      this.logger.warn(`Invalid email format for ZeroBounce validation: ${email}`);
      return {
        address: email,
        status: 'invalid',
        sub_status: 'format_error', // Adding sub_status for clarity
        valid: false,
        error: 'Invalid email format'
      };
    }
    
    try {
      this.logger.info(`Validating email with ZeroBounce: ${email}`);
      
      const response = await axios.get(`${this.baseUrl}/validate`, {
        params: {
          api_key: this.apiKey,
          email: email,
          ip_address: '' // As per original code, IP address is optional and can be empty
        }
      });
      
      if (response.status !== 200) {
        this.logger.error(`ZeroBounce API /validate returned status code ${response.status} for email ${email}`);
        throw new Error(`ZeroBounce API returned status code ${response.status}`);
      }
      
      const result = response.data;
      
      // Determine if the email is valid based on the status
      const valid = this.isEmailValid(result);
      
      this.logger.debug(`ZeroBounce validation result for ${email}: ${result.status}, SubStatus: ${result.sub_status}, Valid: ${valid}`);
      
      return {
        address: result.address, // Use address from response
        status: result.status,
        sub_status: result.sub_status,
        account: result.account,
        domain: result.domain,
        did_you_mean: result.did_you_mean,
        domain_age_days: result.domain_age_days,
        smtp_provider: result.smtp_provider,
        mx_record: result.mx_record,
        mx_found: result.mx_found === 'true', // Convert to boolean
        firstname: result.firstname,
        lastname: result.lastname,
        gender: result.gender,
        country: result.country,
        region: result.region,
        city: result.city,
        zipcode: result.zipcode,
        processed_at: result.processed_at,
        valid: valid
      };
    } catch (error) {
      this.logger.error('Error validating email with ZeroBounce', { email, error: error.message, stack: error.stack });
      
      return {
        address: email,
        status: 'error',
        sub_status: 'api_error',
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Determine if an email is valid based on the ZeroBounce status
   * @param {Object} result - ZeroBounce API result
   * @returns {boolean} Whether the email is valid
   */
  isEmailValid(result) {
    // Valid statuses according to ZeroBounce docs
    const validStatuses = ['valid']; 
    // We are strict: only 'valid' status is considered truly usable.
    // 'catch-all' might be valid but often not desirable for outreach.
    // 'unknown', 'spamtrap', 'abuse', 'do_not_mail' are definitely not valid.
    
    return validStatuses.includes(result.status);
  }

  /**
   * Batch validate multiple email addresses (max 100 at a time as per original code)
   * @param {Array<string>} emails - Array of email addresses
   * @returns {Promise<Array<Object>>} Array of validation results
   */
  async batchValidateEmails(emails) {
    this.validateApiKey();
    
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      this.logger.warn('ZeroBounce batchValidateEmails called with no emails.');
      return [];
    }
    
    // ZeroBounce limits batch size (original code mentioned 100)
    const maxBatchSize = this.config.enrichment?.zeroBounceMaxBatchSize || 100;
    
    if (emails.length > maxBatchSize) {
      this.logger.warn(`ZeroBounce batch size exceeds maximum of ${maxBatchSize}. Only validating first ${maxBatchSize} emails.`);
      emails = emails.slice(0, maxBatchSize);
    }
    
    try {
      this.logger.info(`Batch validating ${emails.length} emails with ZeroBounce`);
      
      const apiUrl = `${this.baseUrl}/validatebatch`; // Endpoint for batch
      
      const batchData = emails.map(email => ({
        email_address: email,
        ip_address: '' // Optional, can be empty
      }));
      
      const response = await axios.post(apiUrl, { // POST request for batch
        api_key: this.apiKey,
        email_batch: batchData
      });
      
      if (response.status !== 200) {
        this.logger.error(`ZeroBounce API /validatebatch returned status code ${response.status}`);
        throw new Error(`ZeroBounce API returned status code ${response.status}`);
      }
      
      // Process the results and add the 'valid' flag
      const results = response.data.email_batch.map(result => ({
        address: result.address, // Use address from response
        status: result.status,
        sub_status: result.sub_status,
        // ... include other relevant fields from batch response if needed
        valid: this.isEmailValid(result)
      }));
      
      this.logger.debug(`ZeroBounce batch validation completed for ${results.length} emails`);
      
      return results;
    } catch (error) {
      this.logger.error('Error batch validating emails with ZeroBounce', { error: error.message, stack: error.stack });
      
      // Return error results for all emails in the batch
      return emails.map(email => ({
        address: email,
        status: 'error',
        sub_status: 'batch_api_error',
        valid: false,
        error: error.message
      }));
    }
  }
}

module.exports = (config, logger) => {
  return new ZeroBounceService(config, logger);
};
