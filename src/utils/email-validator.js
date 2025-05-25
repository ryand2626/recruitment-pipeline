/**
 * Email Compliance Validator
 * Validates emails for CAN-SPAM, DMARC, and other compliance requirements
 */

const config = require('../../config/config');
const logger = require('./logger');

class EmailValidator {
  /**
   * Validate an email subject line for compliance
   * @param {string} subject - The email subject to validate
   * @returns {Object} Validation result { isValid: boolean, errors: string[] }
   */
  static validateSubject(subject) {
    const errors = [];
    const { maxSubjectLength, requiredSubjectElements, prohibitedWords } = config.email.compliance;

    if (!subject || typeof subject !== 'string') {
      return { isValid: false, errors: ['Subject is required'] };
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
  static validateEmailContent(email) {
    const warnings = [];
    const { physicalAddress } = config.email;

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
      warnings.push('Missing physical address in email content');
    }

    // Check for unsubscribe link
    const hasUnsubscribeLink = 
      (email.html && email.html.includes('unsubscribe')) ||
      (email.text && email.text.toLowerCase().includes('unsubscribe'));
    
    if (!hasUnsubscribeLink) {
      warnings.push('Missing unsubscribe link in email content');
    }

    return {
      isValid: warnings.length === 0,
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
  static async logConsent(email, hasConsent, source = 'import') {
    if (!config.email.compliance.logConsentStatus) {
      return;
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
        config.email.compliance.consentExpiryDays
      ];

      await db.query(query, values);
      logger.info('Consent logged', { email, hasConsent, source });
    } catch (error) {
      logger.error('Error logging consent', { error: error.message, email });
      // Don't throw, as this shouldn't block email sending
    }
  }

  /**
   * Check if an email has valid consent
   * @param {string} email - Email to check
   * @returns {Promise<boolean>} True if email has valid consent
   */
  static async hasValidConsent(email) {
    try {
      const query = `
        SELECT has_consent 
        FROM email_consent 
        WHERE email = $1 
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY updated_at DESC 
        LIMIT 1
      `;
      
      const result = await db.query(query, [email]);
      return result.rows.length > 0 && result.rows[0].has_consent;
    } catch (error) {
      logger.error('Error checking consent', { error: error.message, email });
      // Default to false if there's an error (fail-safe)
      return false;
    }
  }
}

module.exports = EmailValidator;
