/**
 * SerpAPI client for scraping Google Jobs results
 * Searches for specific job titles and saves results to the database
 */

const axios = require('axios');
const db = require('../db');
const { withRetries } = require('../../utils/custom-retry');

module.exports = (config, logger) => {
  const apiKey = config.apiKeys.serpApi;
  const baseUrl = 'https://serpapi.com/search';
  const jobTitles = config.jobTitles;

  /**
   * Validate that the API key is set
   * @throws {Error} If API key is not set
   */
  function validateApiKey() {
    if (!apiKey) {
      throw new Error('SerpAPI key is not set. Please set SERPAPI_KEY in your environment variables.');
    }
  }

  /**
   * Search for jobs using the SerpAPI Google Jobs endpoint (this is the equivalent of scrapeSerpApiPage)
   * @param {string} jobTitle - Job title to search for
   * @param {number} location - Location to search in
   * @param {number} page - Page number (0-indexed)
   * @returns {Promise<Object>} SerpAPI response
   */
  const baseUrl = 'https://serpapi.com/search';
  const jobTitles = config.jobTitles;

  // Note: config is directly available in this scope, not this.config
  const serviceRetryOptions = { 
    ...config.retryConfig.default, 
    ...(config.retryConfig.services.serpApi || {}) 
  };

  const retryConfigForWithRetries = {
    retries: serviceRetryOptions.retries,
    initialDelay: serviceRetryOptions.initialDelayMs,
    maxDelay: serviceRetryOptions.maxDelayMs,
    backoffFactor: serviceRetryOptions.backoffFactor,
    jitter: serviceRetryOptions.jitter
  };

  /**
   * Validate that the API key is set
   * @throws {Error} If API key is not set
   */
  function validateApiKey() {
    if (!apiKey) {
      throw new Error('SerpAPI key is not set. Please set SERPAPI_KEY in your environment variables.');
    }
  }

  /**
   * Search for jobs using the SerpAPI Google Jobs endpoint (this is the equivalent of scrapeSerpApiPage)
   * @param {string} jobTitle - Job title to search for
   * @param {number} location - Location to search in
   * @param {number} page - Page number (0-indexed)
   * @returns {Promise<Object>} SerpAPI response data
   */
  async function searchJobs(jobTitle, location = 'United States', page = 0) {
    validateApiKey(); // Stays at the top

    const apiCall = () => { // Define the axios call as a function
      const params = {
        engine: 'google_jobs',
        q: jobTitle,
        location: location,
        hl: 'en',
        api_key: apiKey, // Ensure apiKey is accessible here
        start: page * 10
      };
      return axios.get(baseUrl, { params }); // Ensure baseUrl is accessible
    };

    try {
      logger.info(`Searching for "${jobTitle}" jobs in ${location}, page ${page} via SerpAPI`);
      
      const responseData = await withRetries(apiCall, retryConfigForWithRetries); // Pass the new config
      
      // Note: withRetries returns the result of asyncFn, which for axios is the response object.
      // So, responseData here will be the axios response. Access data with responseData.data.
      // The original code directly used 'response' as the axios response.
      
      // The original code checked response.status !== 200 and threw an error.
      // The default shouldRetry in custom-retry.js handles non-2xx statuses by retrying or throwing.
      // So, if withRetries resolves, it means we got a successful response (typically 2xx).
      // Thus, the `if (response.status !== 200)` check might be redundant if withRetries
      // is configured to only resolve on success. Assuming default shouldRetry.
      // If we reach here, it's a success.

      logger.info(`Found ${responseData.data.jobs_results?.length || 0} jobs for "${jobTitle}" via SerpAPI`);
      return responseData.data; // Return the data part of the response
    } catch (error) {
      logger.error('Error searching for jobs with SerpAPI (after retries)', { // Update log message
        jobTitle,
        location,
        page,
        error: error.message // error.message should be sufficient
      });
      throw error; // Re-throw error as per original logic
    }
  }

  /**
   * Process job results and save to database
   * @param {Array} jobsResults - Array of job results from SerpAPI
   * @param {string} source - Source of the jobs data
   * @returns {Promise<Array>} Array of inserted jobs
   */
  async function processJobResults(jobsResults, source = 'serpapi') {
    if (!jobsResults || !Array.isArray(jobsResults)) {
      logger.warn('No job results to process from SerpAPI');
      return [];
    }

    const insertedJobs = [];

    for (const job of jobsResults) {
      try {
        // Check if job already exists in database by URL
        const exists = await db.jobExists(job.link);
        if (exists) {
          logger.debug(`Job already exists in database: ${job.title} at ${job.company_name} (SerpAPI)`);
          continue;
        }

        // Extract salary range if available
        let salaryRange = null;
        if (job.detected_extensions && job.detected_extensions.salary) {
          salaryRange = job.detected_extensions.salary;
        }

        // Prepare job data for database
        const jobData = {
          title: job.title,
          company: job.company_name,
          location: job.location,
          description: job.description,
          salary_range: salaryRange,
          job_url: job.link,
          contact_email: null, // Will be filled by enrichment service
          contact_name: null, // Will be filled by enrichment service
          company_domain: null, // Will be filled by enrichment service
          raw_json: JSON.stringify(job),
          source: source
        };

        // Insert job into database
        const insertedJob = await db.insertJob(jobData);
        insertedJobs.push(insertedJob);
        
        logger.info(`Inserted job from SerpAPI: ${insertedJob.title} at ${insertedJob.company}`);
      } catch (error) {
        logger.error('Error processing job from SerpAPI', {
          job: job.title,
          company: job.company_name,
          error: error.message
        });
        // Continue with next job
        continue;
      }
    }

    return insertedJobs;
  }

  /**
   * Scrape jobs for all configured job titles using SerpAPI
   * @param {number} numPages - Number of pages to scrape per job title
   * @returns {Promise<Object>} Results summary
   */
  async function scrapeAllJobs(numPages = 3) {
    validateApiKey();
    
    const results = {
      total: 0,
      byTitle: {}
    };

    for (const jobTitle of jobTitles) {
      try {
        results.byTitle[jobTitle] = 0;
        
        // Scrape multiple pages for each job title
        for (let page = 0; page < numPages; page++) {
          // Using searchJobs which is the refactored version of scrapeSerpApiPage
          const data = await searchJobs(jobTitle, 'United States', page); 
          
          if (!data.jobs_results || !data.jobs_results.length) {
            logger.info(`No more results from SerpAPI for "${jobTitle}" on page ${page}`);
            break;
          }
          
          const insertedJobs = await processJobResults(data.jobs_results);
          
          results.byTitle[jobTitle] += insertedJobs.length;
          results.total += insertedJobs.length;
          
          // Add some delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, config.scraping.requestDelay));
        }
        
        logger.info(`Completed scraping SerpAPI for "${jobTitle}". Added ${results.byTitle[jobTitle]} new jobs.`);
      } catch (error) {
        logger.error(`Error scraping SerpAPI for "${jobTitle}"`, { error: error.message });
      }
    }
    
    logger.info(`Completed scraping all job titles from SerpAPI. Added ${results.total} new jobs in total.`);
    return results;
  }

  // The example asked for scrapeSerpApiPage, which I've named searchJobs for clarity as it's the primary search function.
  // If scrapeSerpApiPage is specifically needed as a separate export with that name, it can be an alias to searchJobs.
  return {
    scrapeAllJobs,
    scrapeSerpApiPage: searchJobs // Exporting searchJobs as scrapeSerpApiPage
  };
};
