/**
 * Email Compliance Validator
 * Validates emails for CAN-SPAM, DMARC, and other compliance requirements
 */

// const config = require('../../config/config'); // Remove
// const logger = require('./logger'); // Remove
// const db = require('../db'); // This would be removed if db is passed to methods, but we'll inject it.

class EmailValidator {
  constructor(config, logger, db) {
    this.config = config;
    this.logger = logger;
    this.db = db; // For logConsent and hasValidConsent
  }

  /**
   * Validate an email subject line for compliance
   * @param {string} subject - The email subject to validate
   * @returns {Object} Validation result { isValid: boolean, errors: string[] }
   */
  validateSubject(subject) {
    const errors = [];
    // Use this.config for compliance settings
    const { maxSubjectLength, requiredSubjectElements, prohibitedWords } = this.config.email.compliance;

    if (!subject || typeof subject !== 'string') {
      this.logger.warn('validateSubject called with invalid subject', { subject });
      return { isValid: false, errors: ['Subject is required and must be a string'] };
    }

    // Check length
    if (subject.length > maxSubjectLength) {
      errors.push(`Subject exceeds maximum length of ${maxSubjectLength} characters`);
    }

    // Check for required elements
    requiredSubjectElements.forEach(element => {
      if (!subject.includes(element)) {
        errors.push(`Subject must include: ${element}`);
      }
    });

    // Check for prohibited words
    const lowerSubject = subject.toLowerCase();
    prohibitedWords.forEach(word => {
      if (lowerSubject.includes(word.toLowerCase())) {
        errors.push(`Subject contains prohibited word: ${word}`);
      }
    });

    // Check for excessive punctuation or ALL CAPS
    const excessivePunctuation = /[!?]{3,}/.test(subject);
    const allCaps = subject === subject.toUpperCase() && /[A-Z]/.test(subject);
    
    if (excessivePunctuation) {
      errors.push('Subject contains excessive punctuation');
    }
    
    if (allCaps) {
      errors.push('Subject is in all caps');
    }
    
    if (errors.length > 0) {
        this.logger.debug('Subject validation failed', { subject, errors });
    } else {
        this.logger.debug('Subject validation successful', { subject });
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : null
    };
  }

  /**
   * Validate email content for CAN-SPAM compliance
   * @param {Object} email - Email object containing content and headers
   * @returns {Object} Validation result { isValid: boolean, warnings: string[] }
   */
  validateEmailContent(email) {
    const warnings = [];
    // Use this.config for email settings
    const { physicalAddress } = this.config.email;

    if (!email || typeof email !== 'object') {
      this.logger.warn('validateEmailContent called with invalid email object', { email });
      return { isValid: false, warnings: ['Email object is required'] };
    }
    
    // Check for required CAN-SPAM elements
    if (!email.from) {
      warnings.push('Missing From header');
    }

    if (!email.subject) {
      warnings.push('Missing Subject');
    }

    // Check for physical address in HTML or plain text
    const hasPhysicalAddress = 
      (email.html && email.html.includes(physicalAddress)) ||
      (email.text && email.text.includes(physicalAddress));
    
    if (!hasPhysicalAddress) {
      warnings.push(`Missing physical address in email content. Expected: ${physicalAddress}`);
    }

    // Check for unsubscribe link
    const hasUnsubscribeLink = 
      (email.html && (email.html.includes('unsubscribe') || email.html.includes('opt-out') || email.html.includes('Opt-Out'))) ||
      (email.text && (email.text.toLowerCase().includes('unsubscribe') || email.text.toLowerCase().includes('opt-out')));
    
    if (!hasUnsubscribeLink) {
      warnings.push('Missing unsubscribe link in email content');
    }

    if (warnings.length > 0) {
        this.logger.debug('Email content validation failed', { emailFrom: email.from, subject: email.subject, warnings });
    } else {
        this.logger.debug('Email content validation successful', { emailFrom: email.from, subject: email.subject });
    }

    return {
      isValid: warnings.length === 0, // isValid should reflect if there are warnings
      warnings: warnings.length > 0 ? warnings : null
    };
  }

  /**
   * Log consent status for email sending
   * @param {string} email - Recipient email
   * @param {boolean} hasConsent - Whether the recipient has given consent
   * @param {string} source - Source of consent (e.g., 'signup', 'import', 'api')
   * @returns {Promise<void>}
   */
  async logConsent(email, hasConsent, source = 'import') {
    // Use this.config to check if logging is enabled
    if (!this.config.email.compliance.logConsentStatus) {
      this.logger.debug('Consent logging is disabled in config. Skipping.', { email });
      return;
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      this.logger.error('Invalid email provided for consent logging', { email });
      return; // Do not attempt to log invalid email
    }

    try {
      const query = `
        INSERT INTO email_consent (email, has_consent, source, expires_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '1 day' * $4)
        ON CONFLICT (email) 
        DO UPDATE SET 
          has_consent = EXCLUDED.has_consent,
          source = EXCLUDED.source,
          updated_at = NOW(),
          expires_at = NOW() + INTERVAL '1 day' * $4
        RETURNING *
      `;
      
      const values = [
        email,
        hasConsent,
        source,
        this.config.email.compliance.consentExpiryDays
      ];

      // Use this.db for database operations
      await this.db.query(query, values);
      this.logger.info('Consent logged successfully', { email, hasConsent, source });
    } catch (error) {
      this.logger.error('Error logging consent to database', { error: error.message, email, stack: error.stack });
      // Don't throw, as this shouldn't block email sending (as per original logic)
    }
  }

  /**
   * Check if an email has valid consent
   * @param {string} email - Email to check
   * @returns {Promise<boolean>} True if email has valid consent
   */
  async hasValidConsent(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      this.logger.warn('Invalid email provided for consent check', { email });
      return false; 
    }

    try {
      const query = `
        SELECT has_consent 
        FROM email_consent 
        WHERE email = $1 
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY updated_at DESC 
        LIMIT 1
      `;
      
      // Use this.db for database operations
      const result = await this.db.query(query, [email]);
      const validConsent = result.rows.length > 0 && result.rows[0].has_consent;
      this.logger.debug(`Consent check for ${email}: ${validConsent}`);
      return validConsent;
    } catch (error) {
      this.logger.error('Error checking consent from database', { error: error.message, email, stack: error.stack });
      // Default to false if there's an error (fail-safe, as per original logic)
      return false;
    }
  }
}

module.exports = (config, logger, db) => {
  return new EmailValidator(config, logger, db);
};
