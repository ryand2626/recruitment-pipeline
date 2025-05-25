/**
 * ZeroBounce API integration for email validation
 * Verifies email addresses and rejects catch-all or invalid addresses
 */

const axios = require('axios');
const config = require('../../config/config');
const logger = require('../utils/logger');

class ZeroBounceService {
  constructor() {
    this.apiKey = config.apiKeys.zeroBounce;
    this.baseUrl = 'https://api.zerobounce.net/v2';
  }

  /**
   * Validate that the API key is set
   * @throws {Error} If API key is not set
   */
  validateApiKey() {
    if (!this.apiKey) {
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
        throw new Error(`ZeroBounce API returned status code ${response.status}`);
      }
      
      logger.debug(`ZeroBounce credits remaining: ${response.data.Credits}`);
      return response.data;
    } catch (error) {
      logger.error('Error checking ZeroBounce credits', { error: error.message });
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
      logger.warn(`Invalid email format: ${email}`);
      return {
        address: email,
        status: 'invalid',
        valid: false,
        error: 'Invalid email format'
      };
    }
    
    try {
      logger.info(`Validating email: ${email}`);
      
      const response = await axios.get(`${this.baseUrl}/validate`, {
        params: {
          api_key: this.apiKey,
          email: email,
          ip_address: ''
        }
      });
      
      if (response.status !== 200) {
        throw new Error(`ZeroBounce API returned status code ${response.status}`);
      }
      
      const result = response.data;
      
      // Determine if the email is valid based on the status
      const valid = this.isEmailValid(result);
      
      logger.debug(`Email validation result for ${email}: ${result.status}, Valid: ${valid}`);
      
      return {
        address: email,
        status: result.status,
        sub_status: result.sub_status,
        account: result.account,
        domain: result.domain,
        did_you_mean: result.did_you_mean,
        domain_age_days: result.domain_age_days,
        smtp_provider: result.smtp_provider,
        mx_record: result.mx_record,
        mx_found: result.mx_found,
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
      logger.error('Error validating email', { email, error: error.message });
      
      return {
        address: email,
        status: 'error',
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
    
    // Reject catch-all, invalid, abuse, spamtrap, etc.
    const invalidStatuses = ['invalid', 'abuse', 'spamtrap', 'catch-all', 'unknown'];
    
    if (validStatuses.includes(result.status)) {
      return true;
    } else if (invalidStatuses.includes(result.status)) {
      return false;
    }
    
    // For other statuses like 'do_not_mail', 'unconfirmed', etc.
    // We'll consider them invalid for our purposes
    return false;
  }

  /**
   * Batch validate multiple email addresses (max 100 at a time)
   * @param {Array<string>} emails - Array of email addresses
   * @returns {Promise<Array<Object>>} Array of validation results
   */
  async batchValidateEmails(emails) {
    this.validateApiKey();
    
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return [];
    }
    
    // ZeroBounce limits batch size to 100
    const maxBatchSize = 100;
    
    if (emails.length > maxBatchSize) {
      logger.warn(`Batch size exceeds maximum of ${maxBatchSize}. Only validating first ${maxBatchSize} emails.`);
      emails = emails.slice(0, maxBatchSize);
    }
    
    try {
      logger.info(`Batch validating ${emails.length} emails`);
      
      // For batch validation, we need to format the data for the API
      const apiUrl = `${this.baseUrl}/validatebatch`;
      
      const batchData = emails.map(email => ({
        email_address: email
      }));
      
      const response = await axios.post(apiUrl, {
        api_key: this.apiKey,
        email_batch: batchData
      });
      
      if (response.status !== 200) {
        throw new Error(`ZeroBounce API returned status code ${response.status}`);
      }
      
      // Process the results and add the 'valid' flag
      const results = response.data.email_batch.map(result => ({
        ...result,
        valid: this.isEmailValid(result)
      }));
      
      logger.debug(`Batch validation completed for ${results.length} emails`);
      
      return results;
    } catch (error) {
      logger.error('Error batch validating emails', { error: error.message });
      
      // Return error results for all emails
      return emails.map(email => ({
        address: email,
        status: 'error',
        valid: false,
        error: error.message
      }));
    }
  }
}

module.exports = new ZeroBounceService();
