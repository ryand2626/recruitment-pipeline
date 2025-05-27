/**
 * Smart Scraper Service
 * Automatically chooses the best available scraping method based on rate limits
 */

module.exports = (serpApiClient, playwrightScraper, apifyService, rateLimiter, config, logger) => {
  
  /**
   * Smart job scraping that automatically selects the best available method
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} Scraping results
   */
  async function smartScrapeJobs(options = {}) {
    const results = {
      serpapi: { total: 0, byTitle: {} },
      playwright: { total: 0, byTitle: {}, bySite: {} },
      apify: { total: 0, byTitle: {}, byActor: {} },
      total: 0,
      strategy: null,
      rateLimitInfo: null
    };

    try {
      // Get current rate limiting strategy
      const strategy = rateLimiter.getScrapingStrategy();
      const usageStats = rateLimiter.getUsageStats();
      
      results.strategy = strategy;
      results.rateLimitInfo = usageStats;

      logger.info('Smart scraper starting with strategy', { 
        jobScraping: strategy.jobScraping,
        apiUsage: usageStats.stats
      });

      // Execute job scraping based on strategy
      if (strategy.jobScraping.primary === 'serpApi') {
        logger.info('Using SerpAPI as primary job scraping method');
        results.serpapi = await executeSerpApiScraping(options);
        results.total += results.serpapi.total;
      } else {
        logger.info(`Using Apify as primary job scraping method: ${strategy.jobScraping.reason}`);
        results.apify = await executeApifyScraping(options);
        results.total += results.apify.total;
      }

      // If primary method didn't yield enough results, try fallback
      if (results.total < (options.minResults || 10)) {
        logger.info(`Primary method yielded ${results.total} results, trying fallback methods`);
        
        if (strategy.jobScraping.primary !== 'apify') {
          logger.info('Trying Apify as fallback');
          const apifyResults = await executeApifyScraping(options);
          results.apify = apifyResults;
          results.total += apifyResults.total;
        }

        // Try Playwright as last resort if still not enough results
        if (results.total < (options.minResults || 10)) {
          logger.info('Trying Playwright as last resort');
          const playwrightResults = await executePlaywrightScraping(options);
          results.playwright = playwrightResults;
          results.total += playwrightResults.total;
        }
      }

      logger.info(`Smart scraping completed. Total jobs found: ${results.total}`, {
        serpapi: results.serpapi.total,
        apify: results.apify.total,
        playwright: results.playwright.total
      });

      return results;

    } catch (error) {
      logger.error('Error in smart scraping', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute SerpAPI scraping with rate limiting
   */
  async function executeSerpApiScraping(options) {
    return await rateLimiter.executeWithRateLimit(
      'jobScraping',
      async () => {
        if (!serpApiClient || typeof serpApiClient.scrapeAllJobs !== 'function') {
          throw new Error('SerpAPI client not available');
        }
        return await serpApiClient.scrapeAllJobs(options.pages || 3);
      },
      async () => {
        logger.info('SerpAPI rate limited, falling back to Apify');
        return await executeApifyScraping(options);
      }
    );
  }

  /**
   * Execute Apify scraping
   */
  async function executeApifyScraping(options) {
    try {
      if (!apifyService || typeof apifyService.runActors !== 'function') {
        logger.warn('Apify service not available');
        return { total: 0, byTitle: {}, byActor: {} };
      }

      logger.info('Starting Apify job scraping');
      
      const results = { total: 0, byTitle: {}, byActor: {} };
      
      // Run Apify actors for each job title
      for (const jobTitle of config.jobTitles) {
        try {
          logger.info(`Running Apify actors for job title: ${jobTitle}`);
          
          // Run actors with job title context
          const actorResults = await apifyService.runActors(jobTitle, {
            // Runtime overrides for job-specific searches
            "apify/indeed-scraper": {
              position: jobTitle,
              location: options.location || "United States",
              maxItems: options.maxItems || 50
            },
            "apify/linkedin-jobs-scraper": {
              keywords: jobTitle,
              location: options.location || "United States",
              maxItems: options.maxItems || 50
            },
            "apify/google-jobs-scraper": {
              queries: [`${jobTitle} ${options.location || "United States"}`],
              maxPagesPerQuery: options.pages || 3
            }
          });

          if (actorResults && actorResults.length > 0) {
            results.byTitle[jobTitle] = actorResults.length;
            results.total += actorResults.length;
            
            // Process and save results to database
            await processApifyResults(actorResults, jobTitle);
            
            logger.info(`Apify scraping for "${jobTitle}" completed. Found ${actorResults.length} jobs.`);
          } else {
            results.byTitle[jobTitle] = 0;
            logger.info(`No results from Apify for "${jobTitle}"`);
          }

          // Add delay between job titles to avoid overwhelming Apify
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
          logger.error(`Error in Apify scraping for "${jobTitle}"`, { error: error.message });
          results.byTitle[jobTitle] = 0;
        }
      }

      return results;

    } catch (error) {
      logger.error('Error in Apify scraping execution', { error: error.message });
      return { total: 0, byTitle: {}, byActor: {} };
    }
  }

  /**
   * Execute Playwright scraping
   */
  async function executePlaywrightScraping(options) {
    try {
      if (!playwrightScraper || typeof playwrightScraper.scrapeAllJobs !== 'function') {
        logger.warn('Playwright scraper not available');
        return { total: 0, byTitle: {}, bySite: {} };
      }

      logger.info('Starting Playwright job scraping');
      return await playwrightScraper.scrapeAllJobs();

    } catch (error) {
      logger.error('Error in Playwright scraping execution', { error: error.message });
      return { total: 0, byTitle: {}, bySite: {} };
    }
  }

  /**
   * Process Apify results and save to database
   */
  async function processApifyResults(results, jobTitle) {
    const db = require('../db');
    let savedCount = 0;

    for (const item of results) {
      try {
        // Extract job data from Apify result
        const jobData = extractJobDataFromApifyResult(item, jobTitle);
        
        if (jobData && jobData.job_url) {
          // Check if job already exists
          const exists = await db.jobExists(jobData.job_url);
          if (!exists) {
            await db.insertJob(jobData);
            savedCount++;
          }
        }
      } catch (error) {
        logger.error('Error processing Apify result', { error: error.message });
      }
    }

    logger.info(`Processed Apify results for "${jobTitle}": ${savedCount} new jobs saved`);
    return savedCount;
  }

  /**
   * Extract standardized job data from Apify result
   */
  function extractJobDataFromApifyResult(item, jobTitle) {
    // This function handles different Apify actor result formats
    // and normalizes them to our database schema
    
    try {
      return {
        title: item.title || item.jobTitle || item.position || jobTitle,
        company: item.company || item.companyName || item.employer || 'Unknown',
        location: item.location || item.jobLocation || 'Unknown',
        description: item.description || item.jobDescription || '',
        salary_range: item.salary || item.salaryRange || null,
        job_url: item.url || item.link || item.jobUrl || '',
        contact_email: item.email || null,
        contact_name: null,
        company_domain: item.companyWebsite || null,
        raw_json: JSON.stringify(item),
        source: 'apify'
      };
    } catch (error) {
      logger.error('Error extracting job data from Apify result', { error: error.message });
      return null;
    }
  }

  /**
   * Get scraping recommendations based on current API limits
   */
  function getScrapingRecommendations() {
    const strategy = rateLimiter.getScrapingStrategy();
    const usageStats = rateLimiter.getUsageStats();

    return {
      recommended: {
        primary: strategy.jobScraping.primary,
        reason: strategy.jobScraping.reason,
        fallback: strategy.jobScraping.fallback
      },
      apiUsage: usageStats.stats,
      nextReset: usageStats.nextReset,
      apifyAvailable: usageStats.apifyFallbackAvailable
    };
  }

  return {
    smartScrapeJobs,
    getScrapingRecommendations,
    executeSerpApiScraping,
    executeApifyScraping,
    executePlaywrightScraping
  };
}; 