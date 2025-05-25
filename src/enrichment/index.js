/**
 * Contact enrichment service
 * Coordinates the various enrichment providers to add contact and company data to job listings
 */

const hunterService = require('./hunter-service');
const clearbitService = require('./clearbit-service');
const zeroBounceService = require('./zerobounce-service');
const db = require('../db');
const logger = require('../utils/logger');

class EnrichmentService {
  constructor() {
    this.hunterService = hunterService;
    this.clearbitService = clearbitService;
    this.zeroBounceService = zeroBounceService;
  }

  /**
   * Extract domain from company name/website or job URL
   * @param {Object} job - Job record
   * @returns {string|null} Extracted domain
   */
  extractDomainFromJob(job) {
    // First check if we already have a company_domain
    if (job.company_domain) {
      return job.company_domain;
    }
    
    // Try to extract from company name
    if (job.company) {
      const domainFromCompany = this.clearbitService.extractDomain(job.company);
      if (domainFromCompany) {
        return domainFromCompany;
      }
    }
    
    // Try to extract from job URL
    if (job.job_url) {
      try {
        const urlObj = new URL(job.job_url);
        const hostname = urlObj.hostname;
        
        // Common job board domains to filter out
        const jobBoardDomains = [
          'linkedin.com',
          'indeed.com',
          'glassdoor.com',
          'monster.com',
          'ziprecruiter.com',
          'dice.com',
          'careerbuilder.com'
        ];
        
        // If it's a job board domain, it's not useful for company contact info
        if (jobBoardDomains.some(domain => hostname.includes(domain))) {
          return null;
        }
        
        return hostname.startsWith('www.') ? hostname.substring(4) : hostname;
      } catch (error) {
        logger.debug(`Failed to extract domain from job URL: ${job.job_url}`, { error: error.message });
      }
    }
    
    return null;
  }

  /**
   * Enrich a job with company and contact information
   * @param {Object} job - Job record to enrich
   * @returns {Promise<Object>} Enriched job record
   */
  async enrichJob(job) {
    logger.info(`Starting enrichment for job: ${job.title} at ${job.company}`);
    
    try {
      // Step 1: Extract or determine company domain
      const domain = this.extractDomainFromJob(job);
      
      if (!domain) {
        logger.warn(`Could not determine domain for job: ${job.id}`);
        return job;
      }
      
      // Update job with the domain
      await db.query(
        'UPDATE jobs SET company_domain = $1 WHERE id = $2',
        [domain, job.id]
      );
      
      // Step 2: Enrich company data with Clearbit
      const companyData = await this.clearbitService.enrichCompany(domain);
      let relevantCompanyData = null;
      
      if (companyData) {
        relevantCompanyData = this.clearbitService.extractRelevantData(companyData);
        
        // Update job with company data
        await db.query(
          'UPDATE jobs SET company_data = $1 WHERE id = $2',
          [JSON.stringify(relevantCompanyData), job.id]
        );
        
        logger.info(`Updated job ${job.id} with company data from Clearbit`);
      }
      
      // Step 3: Find contact information using Hunter.io
      // Try to extract a potential contact name from the job title or description
      let contactFirstName = null;
      let contactLastName = null;
      let contactEmail = null;
      
      // If company data includes LinkedIn or website, we might be able to find a specific contact
      if (relevantCompanyData && relevantCompanyData.name) {
        // For jobs like "M&A Director", we'll look for people with titles like "Head of HR", "Talent Acquisition", etc.
        const hiringRoles = [
          { firstName: 'Talent', lastName: 'Acquisition' },
          { firstName: 'Human', lastName: 'Resources' },
          { firstName: 'HR', lastName: 'Manager' }
        ];
        
        for (const role of hiringRoles) {
          try {
            const emailResult = await this.hunterService.findEmail(role.firstName, role.lastName, domain);
            
            if (emailResult && emailResult.email) {
              contactFirstName = emailResult.firstName;
              contactLastName = emailResult.lastName;
              contactEmail = emailResult.email;
              break;
            }
          } catch (error) {
            logger.debug(`Error finding email for ${role.firstName} ${role.lastName} at ${domain}`, { error: error.message });
            continue;
          }
        }
        
        // If we couldn't find a specific contact, try to get a pattern for the domain
        if (!contactEmail) {
          const domainInfo = await this.hunterService.findDomainPattern(domain);
          
          if (domainInfo && domainInfo.pattern) {
            // Use the first contact found, if any
            if (domainInfo.contacts && domainInfo.contacts.length > 0) {
              const firstContact = domainInfo.contacts[0];
              contactFirstName = firstContact.first_name;
              contactLastName = firstContact.last_name;
              contactEmail = firstContact.value;
            }
          }
        }
      }
      
      // If we found an email, validate it with ZeroBounce
      if (contactEmail) {
        const validationResult = await this.zeroBounceService.validateEmail(contactEmail);
        
        if (validationResult && validationResult.valid) {
          // Update job with contact information
          await db.query(
            'UPDATE jobs SET contact_name = $1, contact_email = $2 WHERE id = $3',
            [`${contactFirstName} ${contactLastName}`, contactEmail, job.id]
          );
          
          logger.info(`Updated job ${job.id} with validated contact: ${contactEmail}`);
        } else {
          logger.warn(`Email ${contactEmail} failed validation: ${validationResult.status}`);
          
          // Email is invalid, so remove it
          contactEmail = null;
        }
      }
      
      // Get the updated job record
      const result = await db.query('SELECT * FROM jobs WHERE id = $1', [job.id]);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error enriching job ${job.id}`, { error: error.message });
      return job;
    }
  }

  /**
   * Enrich all jobs that haven't been enriched yet
   * @param {number} batchSize - Number of jobs to enrich per batch
   * @returns {Promise<Object>} Enrichment results
   */
  async enrichNewJobs(batchSize = 10) {
    try {
      logger.info('Starting enrichment process for new jobs');
      
      // Get jobs that don't have contact info or company data
      const query = `
        SELECT * FROM jobs 
        WHERE (contact_email IS NULL OR company_data IS NULL)
        AND status = 'new'
        LIMIT $1
      `;
      
      const result = await db.query(query, [batchSize]);
      const jobs = result.rows;
      
      logger.info(`Found ${jobs.length} jobs to enrich`);
      
      const enrichmentResults = {
        total: jobs.length,
        successful: 0,
        failed: 0,
        jobs: []
      };
      
      for (const job of jobs) {
        try {
          const enrichedJob = await this.enrichJob(job);
          
          if (enrichedJob.contact_email || (enrichedJob.company_data && enrichedJob.company_data.name)) {
            enrichmentResults.successful++;
          } else {
            enrichmentResults.failed++;
          }
          
          enrichmentResults.jobs.push({
            id: enrichedJob.id,
            title: enrichedJob.title,
            company: enrichedJob.company,
            contact_email: enrichedJob.contact_email,
            has_company_data: !!enrichedJob.company_data
          });
          
          // Add a small delay between API calls
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.error(`Error enriching job ${job.id}`, { error: error.message });
          enrichmentResults.failed++;
          
          enrichmentResults.jobs.push({
            id: job.id,
            title: job.title,
            company: job.company,
            error: error.message
          });
        }
      }
      
      logger.info(`Completed enrichment process. Success: ${enrichmentResults.successful}, Failed: ${enrichmentResults.failed}`);
      return enrichmentResults;
    } catch (error) {
      logger.error('Error in enrichment process', { error: error.message });
      throw error;
    }
  }
}

module.exports = new EnrichmentService();
