/**
 * Playwright-based scraper for job boards without public APIs
 * Provides a fallback mechanism with proxy rotation capability
 */

const { chromium } = require('playwright');
const db = require('../db'); // Keep this for now

module.exports = (config, logger) => {
  const jobTitles = config.jobTitles;
  const userAgent = config.scraping.userAgent;
  // const retries = config.scraping.retries; // Not used in the provided snippet, but kept for reference
  const sites = [ // This could also be part of config if it varies
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

  /**
   * Get a rotating proxy if available
   * @returns {Object|null} Proxy configuration or null
   */
  function getRotatingProxy() {
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
   * @returns {Promise<import('playwright').Browser>} Configured browser instance
   */
  async function setupBrowser() {
    const proxy = getRotatingProxy();
    
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
   * @param {import('playwright').Page} page - Playwright page
   * @param {string} url - Job details URL
   * @param {Object} selectors - CSS selectors for job details
   * @returns {Promise<Object>} Job details
   */
  async function scrapeJobDetails(page, url, selectors) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.scraping.requestTimeout });
      
      // Wait for job details to load
      await page.waitForSelector(selectors.description, { timeout: 10000 })
        .catch(() => logger.warn(`Description selector not found on ${url} for Playwright scraper`));
      
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
      logger.error(`Error scraping job details with Playwright: ${error.message}`, { url });
      return {
        description: '',
        salary_range: null
      };
    }
  }

  /**
   * Scrape jobs from a specific job site
   * @param {string} jobTitle - Job title to search for
   * @param {Object} siteConfig - Site configuration (taken from `sites` array)
   * @returns {Promise<Array>} Array of scraped jobs
   */
  async function scrapeSite(jobTitle, siteConfig) {
    const browser = await setupBrowser();
    const jobs = [];
    
    try {
      const context = await browser.newContext({
        userAgent: userAgent,
        viewport: { width: 1920, height: 1080 }
      });
      
      const page = await context.newPage();
      
      // Navigate to the job search page
      const searchUrl = `${siteConfig.url}${encodeURIComponent(jobTitle)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: config.scraping.requestTimeout });
      
      // Wait for job cards to appear
      await page.waitForSelector(siteConfig.selectors.jobCards, { timeout: 30000 });
      
      // Get all job cards
      const jobCards = await page.$$(siteConfig.selectors.jobCards);
      logger.info(`Found ${jobCards.length} job cards on ${siteConfig.name} for "${jobTitle}" using Playwright`);
      
      // Process each job card
      for (let i = 0; i < jobCards.length; i++) {
        try {
          const card = jobCards[i];
          
          // Extract basic information from the card
          const title = await card.$(siteConfig.selectors.title)
            .then(el => el ? el.textContent() : null)
            .catch(() => null);
          
          const company = await card.$(siteConfig.selectors.company)
            .then(el => el ? el.textContent() : null)
            .catch(() => null);
          
          const location = await card.$(siteConfig.selectors.location)
            .then(el => el ? el.textContent() : null)
            .catch(() => null);
          
          let link = await card.$(siteConfig.selectors.link)
            .then(el => el ? el.getAttribute('href') : null)
            .catch(() => null);

          // Handle cases where link might be relative (e.g. Indeed)
          if (link && !link.startsWith('http') && siteConfig.name === 'indeed') {
            link = `https://www.indeed.com${link}`;
          } else if (link && !link.startsWith('http') && siteConfig.name === 'linkedin' && !link.startsWith('/jobs/view/')) {
             // LinkedIn links might need base if not absolute
             link = `https://www.linkedin.com${link}`;
          }


          if (!title || !company || !link) {
            logger.warn(`Skipping card on ${siteConfig.name} due to missing title, company, or link.`, { title, company, link });
            continue;
          }
          
          // Check if job already exists in database
          const exists = await db.jobExists(link);
          if (exists) {
            logger.debug(`Job already exists in database (Playwright): ${title} at ${company}`);
            continue;
          }
          
          // Get job details
          const details = await scrapeJobDetails(page, link, siteConfig.detailsSelectors);
          
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
              source: siteConfig.name
            }),
            source: siteConfig.name
          };
          
          // Insert job into database
          const insertedJob = await db.insertJob(job);
          jobs.push(insertedJob);
          
          logger.info(`Inserted job from ${siteConfig.name} (Playwright): ${insertedJob.title} at ${insertedJob.company}`);
          
          // Add delay between job detail requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, config.scraping.requestDelay));
        } catch (error) {
          logger.error(`Error processing job card on ${siteConfig.name} (Playwright)`, { error: error.message, cardIndex: i });
          continue;
        }
      }
    } catch (error) {
      logger.error(`Error scraping ${siteConfig.name} with Playwright`, { jobTitle, error: error.message });
    } finally {
      if (browser) { // Ensure browser exists before trying to close
        await browser.close();
      }
    }
    
    return jobs;
  }

  /**
   * Scrape jobs for all configured job titles across all sites using Playwright
   * @returns {Promise<Object>} Results summary
   */
  async function scrapeAllJobs() {
    const results = {
      total: 0,
      byTitle: {},
      bySite: {}
    };
    
    for (const jobTitle of jobTitles) {
      results.byTitle[jobTitle] = 0;
      
      for (const site of sites) { // Use the sites array defined within this factory
        if (!results.bySite[site.name]) {
          results.bySite[site.name] = 0;
        }
        
        try {
          const jobs = await scrapeSite(jobTitle, site); // Pass the site object from the local `sites` array
          
          results.byTitle[jobTitle] += jobs.length;
          results.bySite[site.name] += jobs.length;
          results.total += jobs.length;
          
          logger.info(`Completed Playwright scraping for ${site.name} for "${jobTitle}". Added ${jobs.length} new jobs.`);
        } catch (error) {
          logger.error(`Error during Playwright scraping for ${site.name}, job title "${jobTitle}"`, { error: error.message });
        }
      }
    }
    
    logger.info(`Completed Playwright scraping for all job titles. Added ${results.total} new jobs in total.`);
    return results;
  }

  return {
    scrapeAllJobs,
    scrapeSite // Exporting scrapeSite as per example
  };
};
