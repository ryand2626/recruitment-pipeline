/**
 * Playwright-based scraper for job boards without public APIs
 * Provides a fallback mechanism with proxy rotation capability
 */

const { chromium } = require('playwright');
const config = require('../../config/config');
const db = require('../db');
const logger = require('../utils/logger');

class PlaywrightScraper {
  constructor() {
    this.jobTitles = config.jobTitles;
    this.userAgent = config.scraping.userAgent;
    this.retries = config.scraping.retries;
    this.sites = [
      { 
        name: 'linkedin',
        url: 'https://www.linkedin.com/jobs/search/?keywords=',
        selectors: {
          jobCards: '.jobs-search__results-list li',
          title: '.base-search-card__title',
          company: '.base-search-card__subtitle',
          location: '.job-search-card__location',
          link: 'a.base-card__full-link',
          description: '.show-more-less-html__markup'
        },
        detailsSelectors: {
          description: '.show-more-less-html__markup',
          salary: '.compensation__salary'
        }
      },
      {
        name: 'indeed',
        url: 'https://www.indeed.com/jobs?q=',
        selectors: {
          jobCards: '.jobsearch-ResultsList > div.cardOutline',
          title: '.jcs-JobTitle',
          company: '.companyName',
          location: '.companyLocation',
          link: '.jcs-JobTitle',
          description: '#jobDescriptionText'
        },
        detailsSelectors: {
          description: '#jobDescriptionText',
          salary: '.salary-snippet-container'
        }
      }
    ];
  }

  /**
   * Get a rotating proxy if available
   * @returns {Object|null} Proxy configuration or null
   */
  getRotatingProxy() {
    // Implement proxy rotation here (could be from Oxylabs or similar service)
    // This is a placeholder that would be replaced with actual proxy implementation
    // Using environment variables for proxy credentials
    
    const proxyHost = process.env.PROXY_HOST;
    const proxyPort = process.env.PROXY_PORT;
    const proxyUsername = process.env.PROXY_USERNAME;
    const proxyPassword = process.env.PROXY_PASSWORD;
    
    if (!proxyHost || !proxyPort) {
      return null;
    }
    
    return {
      server: `http://${proxyHost}:${proxyPort}`,
      username: proxyUsername,
      password: proxyPassword
    };
  }

  /**
   * Configure Playwright browser with appropriate settings
   * @returns {Promise<Browser>} Configured browser instance
   */
  async setupBrowser() {
    const proxy = this.getRotatingProxy();
    
    const launchOptions = {
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    };
    
    if (proxy) {
      launchOptions.proxy = proxy;
    }
    
    const browser = await chromium.launch(launchOptions);
    return browser;
  }

  /**
   * Scrape job details from a specific URL
   * @param {Object} page - Playwright page
   * @param {string} url - Job details URL
   * @param {Object} selectors - CSS selectors for job details
   * @returns {Promise<Object>} Job details
   */
  async scrapeJobDetails(page, url, selectors) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.scraping.requestTimeout });
      
      // Wait for job details to load
      await page.waitForSelector(selectors.description, { timeout: 10000 })
        .catch(() => logger.warn(`Description selector not found on ${url}`));
      
      // Extract job description
      const description = await page.textContent(selectors.description)
        .catch(() => '');
      
      // Extract salary information if available
      const salary = await page.textContent(selectors.salary)
        .catch(() => null);
      
      return {
        description: description?.trim(),
        salary_range: salary?.trim() || null
      };
    } catch (error) {
      logger.error(`Error scraping job details: ${error.message}`, { url });
      return {
        description: '',
        salary_range: null
      };
    }
  }

  /**
   * Scrape jobs from a specific job site
   * @param {string} jobTitle - Job title to search for
   * @param {Object} site - Site configuration
   * @returns {Promise<Array>} Array of scraped jobs
   */
  async scrapeSite(jobTitle, site) {
    const browser = await this.setupBrowser();
    const jobs = [];
    
    try {
      const context = await browser.newContext({
        userAgent: this.userAgent,
        viewport: { width: 1920, height: 1080 }
      });
      
      const page = await context.newPage();
      
      // Navigate to the job search page
      const searchUrl = `${site.url}${encodeURIComponent(jobTitle)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: config.scraping.requestTimeout });
      
      // Wait for job cards to appear
      await page.waitForSelector(site.selectors.jobCards, { timeout: 30000 });
      
      // Get all job cards
      const jobCards = await page.$$(site.selectors.jobCards);
      logger.info(`Found ${jobCards.length} job cards on ${site.name} for "${jobTitle}"`);
      
      // Process each job card
      for (let i = 0; i < jobCards.length; i++) {
        try {
          const card = jobCards[i];
          
          // Extract basic information from the card
          const title = await card.$(site.selectors.title)
            .then(el => el ? el.textContent() : null)
            .catch(() => null);
          
          const company = await card.$(site.selectors.company)
            .then(el => el ? el.textContent() : null)
            .catch(() => null);
          
          const location = await card.$(site.selectors.location)
            .then(el => el ? el.textContent() : null)
            .catch(() => null);
          
          const link = await card.$(site.selectors.link)
            .then(el => el ? el.getAttribute('href') : null)
            .catch(() => null);
          
          if (!title || !company || !link) {
            continue;
          }
          
          // Check if job already exists in database
          const exists = await db.jobExists(link);
          if (exists) {
            logger.debug(`Job already exists in database: ${title} at ${company}`);
            continue;
          }
          
          // Get job details
          const details = await this.scrapeJobDetails(page, link, site.detailsSelectors);
          
          // Create job object
          const job = {
            title: title.trim(),
            company: company.trim(),
            location: location ? location.trim() : 'Not specified',
            description: details.description,
            salary_range: details.salary_range,
            job_url: link,
            contact_email: null, // Will be filled by enrichment service
            contact_name: null, // Will be filled by enrichment service
            company_domain: null, // Will be filled by enrichment service
            raw_json: JSON.stringify({
              title: title.trim(),
              company_name: company.trim(),
              location: location ? location.trim() : 'Not specified',
              link: link,
              description: details.description,
              salary: details.salary_range,
              source: site.name
            }),
            source: site.name
          };
          
          // Insert job into database
          const insertedJob = await db.insertJob(job);
          jobs.push(insertedJob);
          
          logger.info(`Inserted job from ${site.name}: ${insertedJob.title} at ${insertedJob.company}`);
          
          // Add delay between job detail requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, config.scraping.requestDelay));
        } catch (error) {
          logger.error(`Error processing job card on ${site.name}`, { error: error.message });
          continue;
        }
      }
    } catch (error) {
      logger.error(`Error scraping ${site.name}`, { jobTitle, error: error.message });
    } finally {
      await browser.close();
    }
    
    return jobs;
  }

  /**
   * Scrape jobs for all configured job titles across all sites
   * @returns {Promise<Object>} Results summary
   */
  async scrapeAllJobs() {
    const results = {
      total: 0,
      byTitle: {},
      bySite: {}
    };
    
    for (const jobTitle of this.jobTitles) {
      results.byTitle[jobTitle] = 0;
      
      for (const site of this.sites) {
        if (!results.bySite[site.name]) {
          results.bySite[site.name] = 0;
        }
        
        try {
          const jobs = await this.scrapeSite(jobTitle, site);
          
          results.byTitle[jobTitle] += jobs.length;
          results.bySite[site.name] += jobs.length;
          results.total += jobs.length;
          
          logger.info(`Completed scraping ${site.name} for "${jobTitle}". Added ${jobs.length} new jobs.`);
        } catch (error) {
          logger.error(`Error scraping ${site.name} for "${jobTitle}"`, { error: error.message });
        }
      }
    }
    
    logger.info(`Completed scraping all job titles across all sites. Added ${results.total} new jobs in total.`);
    return results;
  }
}

module.exports = new PlaywrightScraper();
