/**
 * Main entry point for the job scraping functionality
 * Orchestrates both the SerpAPI client and Playwright scraper
 */

// const serpApiClient = require('./serpapi-client'); // Remove
// const playwrightScraper = require('./playwright-scraper'); // Remove
// const logger = require('../utils/logger'); // Remove
// const config = require('../../config/config'); // Remove

module.exports = (serpApiClient, playwrightScraper, config, logger) => {
  /**
   * Run all scrapers to collect job data
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} Scraping results
   */
  async function runAllScrapers(options = {}) {
    const results = {
      serpapi: { total: 0, byTitle: {} },
      playwright: { total: 0, byTitle: {}, bySite: {} },
      total: 0
    };

    try {
      // Run SerpAPI scraper if API key is available
      if (config.apiKeys.serpApi) {
        logger.info('Starting SerpAPI scraper via orchestrator');
        // Ensure serpApiClient is not null or undefined before calling methods
        if (serpApiClient && typeof serpApiClient.scrapeAllJobs === 'function') {
            const serpApiResults = await serpApiClient.scrapeAllJobs(options.pages || config.scraping.serpApiPages || 3);
            results.serpapi = serpApiResults;
            results.total += serpApiResults.total;
            logger.info(`SerpAPI scraper completed via orchestrator. Added ${serpApiResults.total} jobs.`);
        } else {
            logger.error('SerpAPI client is not available or scrapeAllJobs method is missing.');
        }
      } else {
        logger.warn('SerpAPI key not configured. Skipping SerpAPI scraper via orchestrator.');
      }

      // Run Playwright scraper as fallback or primary
      logger.info('Starting Playwright scraper via orchestrator');
      // Ensure playwrightScraper is not null or undefined before calling methods
      if (playwrightScraper && typeof playwrightScraper.scrapeAllJobs === 'function') {
          const playwrightResults = await playwrightScraper.scrapeAllJobs();
          results.playwright = playwrightResults;
          results.total += playwrightResults.total;
          logger.info(`Playwright scraper completed via orchestrator. Added ${playwrightResults.total} jobs.`);
      } else {
          logger.error('Playwright scraper is not available or scrapeAllJobs method is missing.');
      }

    } catch (error) {
      logger.error('Error running scrapers via orchestrator', { error: error.message, stack: error.stack });
    }

    return results;
  }

  /**
   * Run only the SerpAPI scraper
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} Scraping results
   */
  async function runSerpApiScraper(options = {}) {
    try {
      if (!config.apiKeys.serpApi) {
        throw new Error('SerpAPI key not configured for direct run');
      }
      if (!serpApiClient || typeof serpApiClient.scrapeAllJobs !== 'function') {
        logger.error('SerpAPI client is not available or scrapeAllJobs method is missing for direct run.');
        throw new Error('SerpAPI client is not properly configured for direct run.');
      }

      logger.info('Starting SerpAPI scraper directly');
      const results = await serpApiClient.scrapeAllJobs(options.pages || config.scraping.serpApiPages || 3);
      logger.info(`SerpAPI scraper completed directly. Added ${results.total} jobs.`);
      return results;
    } catch (error) {
      logger.error('Error running SerpAPI scraper directly', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Run only the Playwright scraper
   * @returns {Promise<Object>} Scraping results
   */
  async function runPlaywrightScraper() {
    try {
      if (!playwrightScraper || typeof playwrightScraper.scrapeAllJobs !== 'function') {
        logger.error('Playwright scraper is not available or scrapeAllJobs method is missing for direct run.');
        throw new Error('Playwright scraper is not properly configured for direct run.');
      }
      logger.info('Starting Playwright scraper directly');
      const results = await playwrightScraper.scrapeAllJobs();
      logger.info(`Playwright scraper completed directly. Added ${results.total} jobs.`);
      return results;
    } catch (error) {
      logger.error('Error running Playwright scraper directly', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  return {
    runAllScrapers,
    runSerpApiScraper,
    runPlaywrightScraper
  };
};
