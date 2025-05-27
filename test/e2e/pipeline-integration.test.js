const { initializeServices } = require('../../src/service-registration');
const container = require('../../src/container');

describe('Job Pipeline End-to-End Integration', () => {
  let scrapersService;
  let enrichmentService;
  let outreachWorker;
  let sendgridService;
  let db;
  let logger;

  beforeAll(async () => {
    // Initialize all services
    initializeServices();
    
    // Resolve services from container
    scrapersService = container.get('scrapersService');
    enrichmentService = container.get('enrichmentService');
    outreachWorker = container.get('outreachWorker');
    sendgridService = container.get('sendgridService');
    db = container.get('db');
    logger = container.get('logger');
  });

  afterAll(async () => {
    // Clean up test data
    try {
      if (db && typeof db.query === 'function') {
        await db.query('DELETE FROM jobs WHERE title LIKE $1', ['%TEST%']);
        await db.query('DELETE FROM email_events WHERE job_id LIKE $1', ['%test%']);
      }
    } catch (error) {
      console.warn('Cleanup failed:', error.message);
    }
  });

  describe('Service Initialization', () => {
    test('should initialize all core services successfully', () => {
      expect(scrapersService).toBeDefined();
      expect(enrichmentService).toBeDefined();
      expect(outreachWorker).toBeDefined();
      expect(sendgridService).toBeDefined();
      expect(db).toBeDefined();
      expect(logger).toBeDefined();
    });

    test('should have all required service methods', () => {
      // Scrapers service methods
      expect(typeof scrapersService.runAllScrapers).toBe('function');
      
      // Enrichment service methods
      expect(typeof enrichmentService.enrichJob).toBe('function');
      expect(typeof enrichmentService.enrichNewJobs).toBe('function');
      
      // Outreach worker methods
      expect(typeof outreachWorker.processBatch).toBe('function');
      expect(typeof outreachWorker.initWebhookServer).toBe('function');
      
      // SendGrid service methods
      expect(typeof sendgridService.sendJobOutreach).toBe('function');
    });
  });

  describe('Database Integration', () => {
    test('should connect to database successfully', async () => {
      try {
        const result = await db.query('SELECT 1 as test');
        expect(result.rows[0].test).toBe(1);
      } catch (error) {
        // Skip test if database is not available (expected in CI/test environments)
        if (error.message.includes('ENOTFOUND postgres')) {
          console.warn('Database not available for integration tests - skipping database tests');
          return;
        }
        throw error;
      }
    });

    test('should have all required tables', async () => {
      try {
        const tables = ['jobs', 'email_events', 'unsubscribe_list', 'email_consent', 'domains_cache'];
        
        for (const table of tables) {
          const result = await db.query(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)",
            [table]
          );
          expect(result.rows[0].exists).toBe(true);
        }
      } catch (error) {
        if (error.message.includes('ENOTFOUND postgres')) {
          console.warn('Database not available - skipping table existence test');
          return;
        }
        throw error;
      }
    });

    test('should be able to insert and retrieve test job', async () => {
      try {
        const testJob = {
          title: 'TEST Integration Job',
          company: 'TEST Company',
          location: 'TEST Location',
          job_url: 'https://test.com/job/123',
          source: 'integration_test'
        };

        // Insert test job
        const insertResult = await db.query(
          `INSERT INTO jobs (title, company, location, job_url, source, status, collected_at) 
           VALUES ($1, $2, $3, $4, $5, 'new', CURRENT_TIMESTAMP) 
           RETURNING id`,
          [testJob.title, testJob.company, testJob.location, testJob.job_url, testJob.source]
        );

        expect(insertResult.rows[0].id).toBeDefined();
        const jobId = insertResult.rows[0].id;

        // Retrieve test job
        const selectResult = await db.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
        expect(selectResult.rows[0].title).toBe(testJob.title);
        expect(selectResult.rows[0].company).toBe(testJob.company);

        // Clean up
        await db.query('DELETE FROM jobs WHERE id = $1', [jobId]);
      } catch (error) {
        if (error.message.includes('ENOTFOUND postgres')) {
          console.warn('Database not available - skipping insert/retrieve test');
          return;
        }
        throw error;
      }
    });
  });

  describe('Configuration Integration', () => {
    test('should have valid configuration loaded', () => {
      const config = container.get('config');
      
      expect(config).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.apiKeys).toBeDefined();
      expect(config.email).toBeDefined();
      expect(config.retryConfig).toBeDefined();
    });

    test('should have API keys configured', () => {
      const config = container.get('config');
      
      // Check that API key properties exist (they might be empty in test environment)
      expect(config.apiKeys).toHaveProperty('serpApi');
      expect(config.apiKeys).toHaveProperty('hunter');
      expect(config.apiKeys).toHaveProperty('clearbit');
      expect(config.apiKeys).toHaveProperty('zeroBounce');
      expect(config.apiKeys).toHaveProperty('sendGrid');
    });

    test('should have email configuration', () => {
      const config = container.get('config');
      
      expect(config.email.fromEmail).toBeDefined();
      expect(config.email.fromName).toBeDefined();
      expect(config.email.rateLimitPerMinute).toBeGreaterThan(0);
    });
  });

  describe('Service Communication', () => {
    test('should be able to create mock job and process through enrichment', async () => {
      // Create a test job
      const testJob = {
        id: 'test-job-123',
        title: 'TEST M&A Associate',
        company: 'TEST Investment Bank',
        location: 'London',
        job_url: 'https://test-bank.com/careers/123'
      };

      // Mock the enrichment process (without making real API calls)
      const mockEnrichmentResult = await enrichmentService.enrichJob(testJob);
      
      // Should return a result object
      expect(mockEnrichmentResult).toBeDefined();
      expect(typeof mockEnrichmentResult).toBe('object');
    });

    test('should be able to process outreach for mock job', async () => {
      const testJob = {
        id: 'test-job-456',
        title: 'TEST Investment Banking Analyst',
        company: 'TEST Bank',
        contact_email: 'test@testbank.com',
        contact_name: 'TEST Contact'
      };

      // Mock the outreach process using sendgridService
      const outreachResult = await sendgridService.sendJobOutreach(testJob);
      
      // Should return a result object
      expect(outreachResult).toBeDefined();
      expect(typeof outreachResult).toBe('object');
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      try {
        // Test with invalid query
        await expect(db.query('INVALID SQL QUERY')).rejects.toThrow();
      } catch (error) {
        if (error.message.includes('ENOTFOUND postgres')) {
          console.warn('Database not available - skipping error handling test');
          return;
        }
        throw error;
      }
    });

    test('should handle missing job data gracefully', async () => {
      const invalidJob = {};
      
      const result = await enrichmentService.enrichJob(invalidJob);
      expect(result).toBeDefined();
      // Should not throw an error, but handle gracefully
    });

    test('should handle missing contact email in outreach', async () => {
      const jobWithoutEmail = {
        id: 'test-job-no-email',
        title: 'TEST Job',
        company: 'TEST Company'
        // No contact_email
      };

      const result = await sendgridService.sendJobOutreach(jobWithoutEmail);
      expect(result).toBeDefined();
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('no_contact_email');
    });
  });

  describe('Logging Integration', () => {
    test('should have logger configured and working', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    test('should be able to log messages', () => {
      // These should not throw errors
      expect(() => {
        logger.info('Integration test log message');
        logger.debug('Integration test debug message');
      }).not.toThrow();
    });
  });

  describe('Performance and Limits', () => {
    test('should handle batch processing efficiently', async () => {
      try {
        const startTime = Date.now();
        
        // Process a small batch
        const result = await enrichmentService.enrichNewJobs(1);
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Should complete within reasonable time (10 seconds)
        expect(duration).toBeLessThan(10000);
        expect(result).toBeDefined();
        expect(typeof result.total_attempted).toBe('number');
      } catch (error) {
        if (error.message.includes('ENOTFOUND postgres')) {
          console.warn('Database not available - skipping batch processing test');
          return;
        }
        throw error;
      }
    });

    test('should respect rate limiting configuration', () => {
      const config = container.get('config');
      
      expect(config.email.rateLimitPerMinute).toBeGreaterThan(0);
      expect(config.email.rateLimitPerMinute).toBeLessThanOrEqual(1000); // Reasonable upper limit
    });
  });
}); 