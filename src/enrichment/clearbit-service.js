/**
 * Clearbit API integration for company data enrichment
 * Provides additional metadata about companies based on domain
 */

const axios = require('axios');
const config = require('../../config/config');
const logger = require('../utils/logger');

class ClearbitService {
  constructor() {
    this.apiKey = config.apiKeys.clearbit;
    this.baseUrl = 'https://company.clearbit.com/v2';
  }

  /**
   * Validate that the API key is set
   * @throws {Error} If API key is not set
   */
  validateApiKey() {
    if (!this.apiKey) {
      throw new Error('Clearbit API key is not set. Please set CLEARBIT_API_KEY in your environment variables.');
    }
  }

  /**
   * Enrich company data based on domain
   * @param {string} domain - Company domain to enrich
   * @returns {Promise<Object>} Enriched company data
   */
  async enrichCompany(domain) {
    this.validateApiKey();

    try {
      logger.info(`Enriching company data for domain: ${domain}`);
      
      const response = await axios.get(`${this.baseUrl}/companies/find`, {
        params: {
          domain: domain
        },
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      });
      
      if (response.status !== 200) {
        throw new Error(`Clearbit API returned status code ${response.status}`);
      }
      
      logger.debug(`Successfully enriched data for ${domain}`);
      return response.data;
    } catch (error) {
      // Handle specific Clearbit errors
      if (error.response) {
        if (error.response.status === 404) {
          logger.warn(`No company data found for domain: ${domain}`);
          return null;
        } else if (error.response.status === 422) {
          logger.warn(`Invalid domain format: ${domain}`);
          return null;
        } else if (error.response.status === 429) {
          logger.warn('Clearbit rate limit exceeded. Try again later.');
          return null;
        }
      }
      
      logger.error('Error enriching company data', { domain, error: error.message });
      return null;
    }
  }

  /**
   * Extract relevant company data for our purposes
   * @param {Object} enrichedData - Full enriched data from Clearbit
   * @returns {Object} Simplified company data
   */
  extractRelevantData(enrichedData) {
    if (!enrichedData) {
      return {
        name: null,
        domain: null,
        description: null,
        founded_year: null,
        location: null,
        employee_count: null,
        industry: null,
        tags: null,
        linkedin_handle: null,
        twitter_handle: null,
        logo_url: null
      };
    }
    
    return {
      name: enrichedData.name,
      domain: enrichedData.domain,
      description: enrichedData.description,
      founded_year: enrichedData.foundedYear,
      location: enrichedData.location ? `${enrichedData.location.city}, ${enrichedData.location.country}` : null,
      employee_count: enrichedData.metrics ? enrichedData.metrics.employeesRange : null,
      industry: enrichedData.category ? enrichedData.category.sector : null,
      tags: enrichedData.tags ? enrichedData.tags.join(', ') : null,
      linkedin_handle: enrichedData.linkedin ? enrichedData.linkedin.handle : null,
      twitter_handle: enrichedData.twitter ? enrichedData.twitter.handle : null,
      logo_url: enrichedData.logo
    };
  }

  /**
   * Update the database with enriched company data
   * @param {string} jobId - ID of the job to update
   * @param {Object} companyData - Enriched company data
   * @param {Object} db - Database connection
   * @returns {Promise<Object>} Updated job record
   */
  async updateJobWithCompanyData(jobId, companyData, db) {
    try {
      const query = `
        UPDATE jobs
        SET 
          company_data = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      
      const values = [
        JSON.stringify(companyData),
        jobId
      ];
      
      const result = await db.query(query, values);
      
      if (result.rows.length > 0) {
        logger.info(`Updated job ${jobId} with company data for ${companyData.name || 'unknown company'}`);
        return result.rows[0];
      } else {
        logger.warn(`Job ${jobId} not found when updating company data`);
        return null;
      }
    } catch (error) {
      logger.error('Error updating job with company data', { jobId, error: error.message });
      throw error;
    }
  }

  /**
   * Extract domain from company name or website
   * @param {string} input - Company name or website
   * @returns {string|null} Extracted domain
   */
  extractDomain(input) {
    if (!input) return null;
    
    // Check if input is already a domain or URL
    if (input.includes('.')) {
      // Extract domain from URL
      try {
        const url = input.startsWith('http') ? input : `http://${input}`;
        const domain = new URL(url).hostname;
        return domain.startsWith('www.') ? domain.substring(4) : domain;
      } catch (e) {
        // If URL parsing fails, it might be a domain with just a TLD
        if (input.includes('.') && !input.includes(' ')) {
          return input.startsWith('www.') ? input.substring(4) : input;
        }
      }
    }
    
    // For company names, we can't reliably guess the domain
    // We would need to use another service or Google search
    return null;
  }
}

module.exports = new ClearbitService();
