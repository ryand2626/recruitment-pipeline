/**
 * Hunter.io API integration for email discovery
 * Finds email patterns and contacts for specific domains
 */

const axios = require('axios');
// const config = require('../../config/config'); // Remove
// const db = require('../db'); // Remove
// const logger = require('../utils/logger');   // Remove

class HunterService {
  constructor(config, logger, db) {
    this.apiKey = config.apiKeys.hunter;
    this.baseUrl = 'https://api.hunter.io/v2';
    this.logger = logger;
    this.db = db; // Store db instance
    this.config = config; // Store config if other parts of it are needed
  }

  /**
   * Validate that the API key is set
   * @throws {Error} If API key is not set
   */
  validateApiKey() {
    if (!this.apiKey) {
      this.logger.error('Hunter.io API key is not set. Please set HUNTER_API_KEY in your environment variables.');
      throw new Error('Hunter.io API key is not set. Please set HUNTER_API_KEY in your environment variables.');
    }
  }

  /**
   * Check if domain information is cached in the database
   * @param {string} domain - Domain to check
   * @returns {Promise<Object|null>} Cached domain data or null
   */
  async getCachedDomainInfo(domain) {
    try {
      const query = 'SELECT * FROM domains_cache WHERE domain = $1';
      const result = await this.db.query(query, [domain]);
      
      if (result.rows.length > 0) {
        const cachedData = result.rows[0];
        
        // Check if the cache is older than 7 days
        const cacheAge = new Date() - new Date(cachedData.last_updated);
        const cacheDays = cacheAge / (1000 * 60 * 60 * 24);
        
        if (cacheDays < (this.config.caching?.hunterCacheDays || 7)) {
          this.logger.debug(`Using cached domain info for ${domain} from Hunter service`);
          return cachedData;
        } else {
          this.logger.debug(`Cache for ${domain} (Hunter service) is older than ${this.config.caching?.hunterCacheDays || 7} days. Refreshing...`);
          return null;
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error checking domain cache (Hunter service)', { domain, error: error.message, stack: error.stack });
      return null;
    }
  }

  /**
   * Cache domain information in the database
   * @param {string} domain - Domain to cache
   * @param {string} emailPattern - Email pattern discovered for the domain
   * @param {Array} contacts - Contacts found for the domain
   * @returns {Promise<Object|null>} Cached domain data or null if error
   */
  async cacheDomainInfo(domain, emailPattern, contacts) {
    try {
      // Check if domain already exists in cache
      const existingQuery = 'SELECT id FROM domains_cache WHERE domain = $1';
      const existingResult = await this.db.query(existingQuery, [domain]);
      
      let result;
      if (existingResult.rows.length > 0) {
        // Update existing cache
        const query = `
          UPDATE domains_cache 
          SET email_pattern = $1, contacts = $2, last_updated = CURRENT_TIMESTAMP 
          WHERE domain = $3
          RETURNING *
        `;
        result = await this.db.query(query, [emailPattern, JSON.stringify(contacts), domain]);
        this.logger.debug(`Updated cache for domain ${domain} (Hunter service)`);
      } else {
        // Insert new cache
        const query = `
          INSERT INTO domains_cache (domain, email_pattern, contacts)
          VALUES ($1, $2, $3)
          RETURNING *
        `;
        result = await this.db.query(query, [domain, emailPattern, JSON.stringify(contacts)]);
        this.logger.debug(`Cached domain info for ${domain} (Hunter service)`);
      }
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error caching domain info (Hunter service)', { domain, error: error.message, stack: error.stack });
      // throw error; // Propagate error if needed, or return null/undefined
      return null;
    }
  }

  /**
   * Find domain pattern using Hunter.io API
   * @param {string} domain - Domain to find pattern for
   * @returns {Promise<Object>} Domain pattern data
   */
  async findDomainPattern(domain) {
    this.validateApiKey();
    
    try {
      // Check cache first
      const cachedData = await this.getCachedDomainInfo(domain);
      if (cachedData && cachedData.contacts) { // Ensure contacts is not null
        return {
          pattern: cachedData.email_pattern,
          contacts: JSON.parse(cachedData.contacts), // Ensure contacts is parsed
          fromCache: true
        };
      }
      
      this.logger.info(`Fetching domain pattern for ${domain} from Hunter.io API`);
      // If not in cache, call the API
      const response = await axios.get(`${this.baseUrl}/domain-search`, {
        params: {
          domain: domain,
          api_key: this.apiKey
        }
      });
      
      if (response.status !== 200) {
        this.logger.error(`Hunter.io API returned status code ${response.status} for domain ${domain}`);
        throw new Error(`Hunter.io API returned status code ${response.status}`);
      }
      
      const data = response.data.data;
      const pattern = data.pattern || null;
      const contacts = data.emails || [];
      
      // Cache the results
      await this.cacheDomainInfo(domain, pattern, contacts);
      
      return {
        pattern: pattern,
        contacts: contacts,
        fromCache: false
      };
    } catch (error) {
      this.logger.error('Error finding domain pattern with Hunter.io', { domain, error: error.message, stack: error.stack });
      
      // Return empty results if API call fails
      return {
        pattern: null,
        contacts: [],
        fromCache: false,
        error: error.message
      };
    }
  }

  /**
   * Find email by name and domain using Hunter.io API
   * @param {string} firstName - First name
   * @param {string} lastName - Last name
   * @param {string} domain - Domain
   * @returns {Promise<Object>} Email finder result
   */
  async findEmail(firstName, lastName, domain) {
    this.validateApiKey();
    
    try {
      // First check if we have domain pattern and contacts cached
      const domainInfo = await this.findDomainPattern(domain);
      
      // Check if we found the person in the cached contacts
      if (domainInfo.contacts && domainInfo.contacts.length > 0) {
        const matchingContact = domainInfo.contacts.find(contact => {
          const contactFirstName = (contact.first_name || '').toLowerCase();
          const contactLastName = (contact.last_name || '').toLowerCase();
          return contactFirstName === firstName.toLowerCase() && contactLastName === lastName.toLowerCase();
        });
        
        if (matchingContact) {
          this.logger.debug(`Found email for ${firstName} ${lastName} at ${domain} in cached Hunter.io contacts`);
          return {
            email: matchingContact.value,
            firstName: matchingContact.first_name,
            lastName: matchingContact.last_name,
            confidence: matchingContact.confidence,
            source: matchingContact.sources && matchingContact.sources.length > 0 ? matchingContact.sources[0].uri : 'cache',
            fromCache: true
          };
        }
      }
      
      this.logger.info(`Searching email for ${firstName} ${lastName} at ${domain} via Hunter.io API`);
      // If not found in cache, call the API
      const response = await axios.get(`${this.baseUrl}/email-finder`, {
        params: {
          domain: domain,
          first_name: firstName,
          last_name: lastName,
          api_key: this.apiKey
        }
      });
      
      if (response.status !== 200) {
         this.logger.error(`Hunter.io Email Finder API returned status code ${response.status} for ${firstName} ${lastName} at ${domain}`);
        throw new Error(`Hunter.io API returned status code ${response.status}`);
      }
      
      const data = response.data.data;
      
      return {
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        confidence: data.score,
        source: data.sources && data.sources.length > 0 ? data.sources[0].uri : null,
        fromCache: false
      };
    } catch (error) {
      this.logger.error('Error finding email with Hunter.io', { firstName, lastName, domain, error: error.message, stack: error.stack });
      
      // Return empty results if API call fails
      return {
        email: null,
        firstName: firstName,
        lastName: lastName,
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Verify an email address using Hunter.io API
   * @param {string} email - Email address to verify
   * @returns {Promise<Object>} Email verification result
   */
  async verifyEmail(email) {
    this.validateApiKey();
    
    try {
      this.logger.info(`Verifying email ${email} with Hunter.io API`);
      const response = await axios.get(`${this.baseUrl}/email-verifier`, {
        params: {
          email: email,
          api_key: this.apiKey
        }
      });
      
      if (response.status !== 200) {
        this.logger.error(`Hunter.io Email Verifier API returned status code ${response.status} for email ${email}`);
        throw new Error(`Hunter.io API returned status code ${response.status}`);
      }
      
      const data = response.data.data;
      
      return {
        email: data.email,
        result: data.result,
        score: data.score,
        regexp: data.regexp,
        gibberish: data.gibberish,
        disposable: data.disposable,
        webmail: data.webmail,
        mx_records: data.mx_records,
        smtp_server: data.smtp_server,
        smtp_check: data.smtp_check,
        accept_all: data.accept_all,
        block: data.block,
        status: data.status // Hunter uses 'status', ZeroBounce uses 'sub_status'
      };
    } catch (error) {
      this.logger.error('Error verifying email with Hunter.io', { email, error: error.message, stack: error.stack });
      
      // Return error result if API call fails
      return {
        email: email,
        result: 'error', // Consistent with how other services might report errors
        score: 0,
        error: error.message
      };
    }
  }
}

module.exports = (config, logger, db) => {
  return new HunterService(config, logger, db);
};
