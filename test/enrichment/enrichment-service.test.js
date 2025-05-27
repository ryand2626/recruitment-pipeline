const createEnrichmentService = require('../../src/enrichment/index');

describe('EnrichmentService', () => {
  let enrichmentService;
  let mockConfig;
  let mockLogger;
  let mockDb;
  let mockClearbitService;
  let mockHunterService;
  let mockZeroBounceService;

  beforeEach(() => {
    // Mock configuration
    mockConfig = {
      retryConfig: {
        default: {
          retries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
          backoffFactor: 2,
          jitter: true
        }
      }
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Mock database
    mockDb = {
      query: jest.fn()
    };

    // Mock services
    mockClearbitService = {
      enrichCompany: jest.fn(),
      extractDomain: jest.fn(),
      extractRelevantData: jest.fn()
    };

    mockHunterService = {
      findEmail: jest.fn(),
      findDomainPattern: jest.fn()
    };

    mockZeroBounceService = {
      validateEmail: jest.fn()
    };

    // Create service instance
    enrichmentService = createEnrichmentService(
      mockHunterService,
      mockClearbitService,
      mockZeroBounceService,
      mockDb,
      mockLogger
    );
  });

  describe('extractDomainFromJob', () => {
    test('should use existing company_domain if available', () => {
      const job = {
        id: 'job-123',
        company_domain: 'existing.com',
        company: 'Test Company'
      };
      
      const result = enrichmentService.extractDomainFromJob(job);
      
      expect(result).toBe('existing.com');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Using pre-existing company_domain: existing.com for job job-123'
      );
    });

    test('should extract domain from company name using clearbit service', () => {
      const job = {
        id: 'job-123',
        company: 'Google Inc'
      };
      
      mockClearbitService.extractDomain.mockReturnValue('google.com');
      
      const result = enrichmentService.extractDomainFromJob(job);
      
      expect(result).toBe('google.com');
      expect(mockClearbitService.extractDomain).toHaveBeenCalledWith('Google Inc');
    });

    test('should extract domain from job URL when company extraction fails', () => {
      const job = {
        id: 'job-123',
        company: 'Test Company',
        job_url: 'https://careers.testcompany.com/jobs/123'
      };
      
      mockClearbitService.extractDomain.mockReturnValue(null);
      
      const result = enrichmentService.extractDomainFromJob(job);
      
      expect(result).toBe('careers.testcompany.com');
    });

    test('should filter out job board domains', () => {
      const job = {
        id: 'job-123',
        company: 'Test Company',
        job_url: 'https://www.linkedin.com/jobs/view/123456'
      };
      
      mockClearbitService.extractDomain.mockReturnValue(null);
      
      const result = enrichmentService.extractDomainFromJob(job);
      
      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('appears to be a common job board')
      );
    });

    test('should return null when no domain can be extracted', () => {
      const job = {
        id: 'job-123',
        company: 'Test Company'
      };
      
      mockClearbitService.extractDomain.mockReturnValue(null);
      
      const result = enrichmentService.extractDomainFromJob(job);
      
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Could not extract domain for job job-123 from company name or job URL.'
      );
    });
  });

  describe('enrichJob', () => {
    const mockJob = {
      id: 'job-123',
      title: 'Software Engineer',
      company: 'Test Company',
      location: 'New York'
    };

    beforeEach(() => {
      // Reset all mocks
      jest.clearAllMocks();
      
      // Mock extractDomainFromJob method
      jest.spyOn(enrichmentService, 'extractDomainFromJob').mockReturnValue('testcompany.com');
    });

    test('should enrich job with company data and contact email', async () => {
      // Mock successful responses
      mockClearbitService.enrichCompany.mockResolvedValue({
        name: 'Test Company Inc',
        domain: 'testcompany.com'
      });
      
      mockClearbitService.extractRelevantData.mockReturnValue({
        name: 'Test Company Inc',
        domain: 'testcompany.com',
        description: 'A test company'
      });

      mockHunterService.findEmail.mockResolvedValue({
        email: 'hr@testcompany.com',
        firstName: 'Jane',
        lastName: 'Doe'
      });

      mockZeroBounceService.validateEmail.mockResolvedValue({
        valid: true,
        status: 'valid'
      });

      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // UPDATE company_domain
        .mockResolvedValueOnce({ rows: [] }) // UPDATE company_data
        .mockResolvedValueOnce({ rows: [] }) // UPDATE contact info
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-123', 
            contact_email: 'hr@testcompany.com',
            status: 'enriched'
          }] 
        }); // SELECT final job

      const result = await enrichmentService.enrichJob(mockJob);

      expect(result).toEqual({
        id: 'job-123',
        contact_email: 'hr@testcompany.com',
        status: 'enriched'
      });

      expect(mockClearbitService.enrichCompany).toHaveBeenCalledWith('testcompany.com');
      expect(mockHunterService.findEmail).toHaveBeenCalled();
      expect(mockZeroBounceService.validateEmail).toHaveBeenCalledWith('hr@testcompany.com');
    });

    test('should handle missing domain gracefully', async () => {
      jest.spyOn(enrichmentService, 'extractDomainFromJob').mockReturnValue(null);
      
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await enrichmentService.enrichJob(mockJob);

      expect(result).toEqual({
        ...mockJob,
        status: 'enrichment_failed'
      });
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Could not determine domain for job: job-123. Enrichment halted for this job.'
      );
    });

    test('should handle service errors gracefully', async () => {
      mockClearbitService.enrichCompany.mockRejectedValue(new Error('API Error'));

      const result = await enrichmentService.enrichJob(mockJob);

      expect(result).toEqual({
        ...mockJob,
        status: 'enrichment_error',
        error: 'API Error'
      });

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('enrichNewJobs', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should process batch of jobs successfully', async () => {
      const mockJobs = [
        { id: 'job-1', title: 'Job 1', company: 'Company A' },
        { id: 'job-2', title: 'Job 2', company: 'Company B' }
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockJobs }) // SELECT jobs to enrich
        .mockResolvedValue({ rows: [] }); // All other DB calls

      // Mock enrichJob to return success
      jest.spyOn(enrichmentService, 'enrichJob').mockResolvedValue({
        id: 'job-1',
        status: 'enriched',
        contact_email: 'test@example.com'
      });

      const result = await enrichmentService.enrichNewJobs(2);

      expect(result).toEqual({
        total_attempted: 2,
        fully_enriched: 2,
        partially_enriched: 0,
        failed_enrichment: 0,
        errors: 0,
        jobs_processed_details: [
          {
            id: 'job-1',
            title: undefined,
            company: undefined,
            status: 'enriched',
            contact_email: 'test@example.com',
            has_company_data: false,
            error_message: undefined
          },
          {
            id: 'job-1',
            title: undefined,
            company: undefined,
            status: 'enriched',
            contact_email: 'test@example.com',
            has_company_data: false,
            error_message: undefined
          }
        ]
      });

      expect(enrichmentService.enrichJob).toHaveBeenCalledTimes(2);
    });

    test('should handle empty job array', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await enrichmentService.enrichNewJobs(10);

      expect(result).toEqual({
        total_attempted: 0,
        fully_enriched: 0,
        partially_enriched: 0,
        failed_enrichment: 0,
        errors: 0,
        jobs_processed_details: []
      });
    });

    test('should handle database errors', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));

      await expect(enrichmentService.enrichNewJobs(10)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
}); 