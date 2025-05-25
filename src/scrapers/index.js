/**
 * Main entry point for the job scraping functionality
 * Orchestrates both the SerpAPI client and Playwright scraper
 */

const serpApiClient = require('./serpapi-client');
const playwrightScraper = require('./playwright-scraper');
const logger = require('../utils/logger');
const config = require('../../config/config');

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
      logger.info('Starting SerpAPI scraper');
      const serpApiResults = await serpApiClient.scrapeAllJobs(options.pages || 3);
      results.serpapi = serpApiResults;
      results.total += serpApiResults.total;
      logger.info(`SerpAPI scraper completed. Added ${serpApiResults.total} jobs.`);
    } else {
      logger.warn('SerpAPI key not configured. Skipping SerpAPI scraper.');
    }

    // Run Playwright scraper as fallback
    logger.info('Starting Playwright scraper');
    const playwrightResults = await playwrightScraper.scrapeAllJobs();
    results.playwright = playwrightResults;
    results.total += playwrightResults.total;
    logger.info(`Playwright scraper completed. Added ${playwrightResults.total} jobs.`);

  } catch (error) {
    logger.error('Error running scrapers', { error: error.message });
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
      throw new Error('SerpAPI key not configured');
    }

    logger.info('Starting SerpAPI scraper');
    const results = await serpApiClient.scrapeAllJobs(options.pages || 3);
    logger.info(`SerpAPI scraper completed. Added ${results.total} jobs.`);
    return results;
  } catch (error) {
    logger.error('Error running SerpAPI scraper', { error: error.message });
    throw error;
  }
}

/**
 * Run only the Playwright scraper
 * @returns {Promise<Object>} Scraping results
 */
async function runPlaywrightScraper() {
  try {
    logger.info('Starting Playwright scraper');
    const results = await playwrightScraper.scrapeAllJobs();
    logger.info(`Playwright scraper completed. Added ${results.total} jobs.`);
    return results;
  } catch (error) {
    logger.error('Error running Playwright scraper', { error: error.message });
    throw error;
  }
}

// If this file is run directly, execute the scraping
if (require.main === module) {
  (async () => {
    try {
      logger.info('Starting job scraping process');
      const results = await runAllScrapers();
      logger.info(`Job scraping process completed. Added ${results.total} jobs in total.`);
      process.exit(0);
    } catch (error) {
      logger.error('Job scraping process failed', { error: error.message });
      process.exit(1);
    }
  })();
}

module.exports = {
  runAllScrapers,
  runSerpApiScraper,
  runPlaywrightScraper
};
