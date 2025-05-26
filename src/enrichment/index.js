/**
 * Contact enrichment service
 * Coordinates the various enrichment providers to add contact and company data to job listings
 */

// const hunterService = require('./hunter-service'); // Removed
// const clearbitService = require('./clearbit-service'); // Removed
// const zeroBounceService = require('./zerobounce-service'); // Removed
// const db = require('../db'); // Removed
// const logger = require('../utils/logger'); // Removed

class EnrichmentService {
  constructor(hunterService, clearbitService, zeroBounceService, db, logger) {
    this.hunterService = hunterService;
    this.clearbitService = clearbitService;
    this.zeroBounceService = zeroBounceService;
    this.db = db;
    this.logger = logger;
  }

  /**
   * Extract domain from company name/website or job URL
   * @param {Object} job - Job record
   * @returns {string|null} Extracted domain
   */
  extractDomainFromJob(job) {
    // First check if we already have a company_domain
    if (job.company_domain) {
      this.logger.debug(`Using pre-existing company_domain: ${job.company_domain} for job ${job.id}`);
      return job.company_domain;
    }
    
    // Try to extract from company name
    if (job.company) {
      const domainFromCompany = this.clearbitService.extractDomain(job.company); // Assumes clearbitService has extractDomain
      if (domainFromCompany) {
        this.logger.debug(`Extracted domain ${domainFromCompany} from company name "${job.company}" for job ${job.id}`);
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
          'linkedin.com', 'indeed.com', 'glassdoor.com', 'monster.com',
          'ziprecruiter.com', 'dice.com', 'careerbuilder.com', 'google.com', // Added google.com as it's common for job postings
          'facebook.com', 'apple.com', 'amazon.jobs', 'microsoft.com', 'careers.google.com' // Other common ones
        ];
        
        // If it's a job board domain, it's not useful for company contact info
        if (jobBoardDomains.some(domain => hostname.includes(domain))) {
          this.logger.debug(`Job URL ${job.job_url} for job ${job.id} appears to be a common job board or large tech company careers page. Skipping domain extraction from URL.`);
          return null;
        }
        
        const extractedDomain = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
        this.logger.debug(`Extracted domain ${extractedDomain} from job URL "${job.job_url}" for job ${job.id}`);
        return extractedDomain;
      } catch (error) {
        this.logger.debug(`Failed to extract domain from job URL: ${job.job_url} for job ${job.id}`, { error: error.message });
      }
    }
    
    this.logger.warn(`Could not extract domain for job ${job.id} from company name or job URL.`);
    return null;
  }

  /**
   * Enrich a job with company and contact information
   * @param {Object} job - Job record to enrich
   * @returns {Promise<Object>} Enriched job record
   */
  async enrichJob(job) {
    this.logger.info(`Starting enrichment for job: ${job.title} at ${job.company} (ID: ${job.id})`);
    
    try {
      // Step 1: Extract or determine company domain
      const domain = this.extractDomainFromJob(job);
      
      if (!domain) {
        this.logger.warn(`Could not determine domain for job: ${job.id}. Enrichment halted for this job.`);
        // Update job status to 'enrichment_failed' or similar
        await this.db.query("UPDATE jobs SET status = 'enrichment_failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [job.id]);
        return { ...job, status: 'enrichment_failed' }; // Return job with updated status
      }
      
      // Update job with the domain (if not already present or different)
      if (job.company_domain !== domain) {
        await this.db.query(
          'UPDATE jobs SET company_domain = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [domain, job.id]
        );
        job.company_domain = domain; // Update in-memory job object
         this.logger.info(`Updated company_domain to ${domain} for job ${job.id}`);
      }
      
      // Step 2: Enrich company data with Clearbit
      let relevantCompanyData = null;
      if (this.clearbitService) {
        const companyData = await this.clearbitService.enrichCompany(domain);
        if (companyData) {
          relevantCompanyData = this.clearbitService.extractRelevantData(companyData);
          await this.db.query(
            'UPDATE jobs SET company_data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [JSON.stringify(relevantCompanyData), job.id]
          );
          job.company_data = relevantCompanyData; // Update in-memory job object
          this.logger.info(`Updated job ${job.id} with company data from Clearbit for domain ${domain}`);
        } else {
          this.logger.info(`No company data found from Clearbit for domain ${domain} (job ID: ${job.id})`);
        }
      } else {
        this.logger.warn('Clearbit service not available for enrichment.');
      }
      
      // Step 3: Find contact information using Hunter.io
      let contactFirstName = null;
      let contactLastName = null;
      let contactEmail = null;
      
      if (this.hunterService && relevantCompanyData && relevantCompanyData.name) { // Only proceed if company data was found
        const hiringRoles = [
          { firstName: 'Talent', lastName: 'Acquisition' },
          { firstName: 'Human', lastName: 'Resources' },
          { firstName: 'Recruiter', lastName: '' }, // Common title
          { firstName: 'HR', lastName: 'Manager' }
        ];
        
        for (const role of hiringRoles) {
          try {
            const emailResult = await this.hunterService.findEmail(role.firstName, role.lastName, domain);
            if (emailResult && emailResult.email) {
              contactFirstName = emailResult.firstName;
              contactLastName = emailResult.lastName;
              contactEmail = emailResult.email;
              this.logger.info(`Found potential contact ${contactEmail} for role ${role.firstName} ${role.lastName} at ${domain} (job ID: ${job.id})`);
              break;
            }
          } catch (error) {
            this.logger.debug(`Error finding email via Hunter for ${role.firstName} ${role.lastName} at ${domain} (job ID: ${job.id})`, { error: error.message });
            continue;
          }
        }
        
        if (!contactEmail) {
          this.logger.info(`No specific hiring contact found for ${domain}. Checking domain pattern. (job ID: ${job.id})`);
          const domainInfo = await this.hunterService.findDomainPattern(domain);
          if (domainInfo && domainInfo.pattern && domainInfo.contacts && domainInfo.contacts.length > 0) {
            const firstContact = domainInfo.contacts[0];
            contactFirstName = firstContact.first_name;
            contactLastName = firstContact.last_name;
            contactEmail = firstContact.value; // Hunter uses 'value' for email
            this.logger.info(`Using first contact ${contactEmail} from domain pattern for ${domain} (job ID: ${job.id})`);
          } else {
             this.logger.info(`No domain pattern or generic contacts found via Hunter for ${domain} (job ID: ${job.id})`);
          }
        }
      } else if (!this.hunterService) {
         this.logger.warn('Hunter.io service not available for contact enrichment.');
      } else if (!relevantCompanyData || !relevantCompanyData.name) {
         this.logger.info(`Skipping Hunter.io search for job ${job.id} as no company data was found via Clearbit.`);
      }
      
      // Step 4: If we found an email, validate it with ZeroBounce
      if (contactEmail && this.zeroBounceService) {
        const validationResult = await this.zeroBounceService.validateEmail(contactEmail);
        if (validationResult && validationResult.valid) {
          const contactName = `${contactFirstName || ''} ${contactLastName || ''}`.trim();
          await this.db.query(
            'UPDATE jobs SET contact_name = $1, contact_email = $2, status = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [contactName, contactEmail, job.id, 'enriched']
          );
          job.contact_name = contactName;
          job.contact_email = contactEmail;
          job.status = 'enriched';
          this.logger.info(`Updated job ${job.id} with validated contact: ${contactEmail}. Status set to 'enriched'.`);
        } else {
          this.logger.warn(`Email ${contactEmail} for job ${job.id} failed ZeroBounce validation: ${validationResult?.status}, sub_status: ${validationResult?.sub_status}. Email not saved.`);
          contactEmail = null; // Clear email if invalid
          // Update status to reflect partial enrichment or failed contact validation
          await this.db.query("UPDATE jobs SET status = 'enrichment_partial', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [job.id]);
          job.status = 'enrichment_partial';
        }
      } else if (contactEmail && !this.zeroBounceService) {
        this.logger.warn(`ZeroBounce service not available. Skipping validation for ${contactEmail} (job ID: ${job.id}). Email will be saved without validation.`);
        // Save without validation if ZeroBounce is not available
        const contactName = `${contactFirstName || ''} ${contactLastName || ''}`.trim();
        await this.db.query(
            'UPDATE jobs SET contact_name = $1, contact_email = $2, status = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [contactName, contactEmail, job.id, 'enriched_unverified_email']
          );
        job.contact_name = contactName;
        job.contact_email = contactEmail;
        job.status = 'enriched_unverified_email';
      }

      // If no contact email was found/validated, but company data was found, update status
      if (!contactEmail && relevantCompanyData) {
        await this.db.query("UPDATE jobs SET status = 'enrichment_partial', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [job.id]);
        job.status = 'enrichment_partial';
        this.logger.info(`Job ${job.id} partially enriched (company data only).`);
      } else if (!contactEmail && !relevantCompanyData) {
         // If domain was found but no clearbit/hunter data, mark as failed
        await this.db.query("UPDATE jobs SET status = 'enrichment_failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [job.id]);
        job.status = 'enrichment_failed';
        this.logger.info(`Job ${job.id} enrichment failed (no company or contact data found for domain ${domain}).`);
      }
      
      // Get the potentially updated job record
      const result = await this.db.query('SELECT * FROM jobs WHERE id = $1', [job.id]);
      return result.rows[0];
    } catch (error) {
      this.logger.error(`Error enriching job ${job.id}: ${error.message}`, { stack: error.stack });
      try {
        await this.db.query("UPDATE jobs SET status = 'enrichment_error', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [job.id]);
      } catch (dbError) {
        this.logger.error(`Failed to update job status to enrichment_error for job ${job.id}`, { dbError: dbError.message });
      }
      return { ...job, status: 'enrichment_error', error: error.message }; // Return job with error status
    }
  }

  /**
   * Enrich all jobs that haven't been enriched yet
   * @param {number} batchSize - Number of jobs to enrich per batch
   * @returns {Promise<Object>} Enrichment results
   */
  async enrichNewJobs(batchSize = 10) {
    try {
      this.logger.info(`Starting enrichment process for new jobs. Batch size: ${batchSize}`);
      
      // Get jobs that don't have contact info or company data, and are in 'new' or 'scraping_successful' status
      // Prioritize 'new' then 'scraping_successful'
      const query = `
        SELECT * FROM jobs 
        WHERE (status = 'new' OR status = 'scraping_successful') 
          AND (contact_email IS NULL OR company_domain IS NULL OR company_data IS NULL)
        ORDER BY created_at ASC
        LIMIT $1
      `;
      
      const result = await this.db.query(query, [batchSize]);
      const jobs = result.rows;
      
      this.logger.info(`Found ${jobs.length} jobs to attempt enrichment for.`);
      
      const enrichmentResults = {
        total_attempted: jobs.length,
        fully_enriched: 0, // Has contact_email and company_data
        partially_enriched: 0, // Has company_data but no contact_email
        failed_enrichment: 0, // No useful data found or error during specific job enrichment
        errors: 0, // System errors or unexpected issues during the batch process
        jobs_processed_details: []
      };
      
      for (const job of jobs) {
        try {
          const enrichedJob = await this.enrichJob(job); // enrichJob now updates status internally
          
          let job_status_summary = 'failed';
          if (enrichedJob.status === 'enriched') {
            enrichmentResults.fully_enriched++;
            job_status_summary = 'fully_enriched';
          } else if (enrichedJob.status === 'enriched_unverified_email') {
            enrichmentResults.fully_enriched++; // Still counts as enriched for now
            job_status_summary = 'enriched_unverified_email';
          } else if (enrichedJob.status === 'enrichment_partial') {
            enrichmentResults.partially_enriched++;
            job_status_summary = 'partially_enriched';
          } else { // enrichment_failed, enrichment_error
            enrichmentResults.failed_enrichment++;
          }
          
          enrichmentResults.jobs_processed_details.push({
            id: enrichedJob.id,
            title: enrichedJob.title,
            company: enrichedJob.company,
            status: enrichedJob.status, // Final status from enrichJob
            contact_email: enrichedJob.contact_email,
            has_company_data: !!(enrichedJob.company_data && (typeof enrichedJob.company_data === 'string' ? JSON.parse(enrichedJob.company_data).name : enrichedJob.company_data.name)),
            error_message: enrichedJob.error // If any error occurred during enrichJob
          });
          
          // Add a small delay between API calls to respect rate limits
          // This could be made configurable
          await new Promise(resolve => setTimeout(resolve, this.clearbitService?.config?.scraping?.requestDelay || 1000));
        } catch (error) { // Catch errors from enrichJob itself if it throws unexpectedly
          this.logger.error(`Unexpected error processing job ${job.id} in enrichNewJobs loop`, { error: error.message, stack: error.stack });
          enrichmentResults.errors++;
          enrichmentResults.jobs_processed_details.push({
            id: job.id,
            title: job.title,
            company: job.company,
            status: 'batch_loop_error',
            error_message: error.message
          });
        }
      }
      
      this.logger.info(`Enrichment process completed. Attempted: ${enrichmentResults.total_attempted}, Fully Enriched: ${enrichmentResults.fully_enriched}, Partially: ${enrichmentResults.partially_enriched}, Failed: ${enrichmentResults.failed_enrichment}, Errors in batch: ${enrichmentResults.errors}`);
      return enrichmentResults;
    } catch (error) {
      this.logger.error('Critical error in enrichNewJobs process', { error: error.message, stack: error.stack });
      // Rethrow or return an error object, depending on how this is called
      throw error; 
    }
  }
}

module.exports = (hunterService, clearbitService, zeroBounceService, db, logger) => {
  return new EnrichmentService(hunterService, clearbitService, zeroBounceService, db, logger);
};
