const createSendGridService = require('../../src/outreach/sendgrid-service');

describe('SendGridService', () => {
  let sendGridService;
  let mockConfig;
  let mockLogger;
  let mockDb;
  let mockEmailValidator;

  beforeEach(() => {
    // Mock configuration
    mockConfig = {
      apiKeys: {
        sendGrid: 'test-api-key'
      },
      email: {
        fromEmail: 'test@example.com',
        fromName: 'Test Sender',
        templateId: 'test-template-id',
        unsubscribeUrl: 'https://example.com/unsubscribe',
        physicalAddress: 'Test Address, Test City',
        rateLimitPerMinute: 100
      },
      retryConfig: {
        default: {
          retries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
          backoffFactor: 2,
          jitter: true
        },
        services: {
          sendGrid: {
            initialDelayMs: 5000
          }
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

    // Mock email validator
    mockEmailValidator = {
      validateSubject: jest.fn(),
      hasValidConsent: jest.fn(),
      validateEmailContent: jest.fn()
    };

    // Create service instance
    sendGridService = createSendGridService(mockConfig, mockLogger, mockDb, mockEmailValidator);
  });

  describe('Constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(sendGridService.apiKey).toBe('test-api-key');
      expect(sendGridService.fromEmail).toBe('test@example.com');
      expect(sendGridService.fromName).toBe('Test Sender');
      expect(sendGridService.rateLimit).toBe(100);
    });

    test('should warn when API key is not set', () => {
      const configWithoutKey = { ...mockConfig };
      configWithoutKey.apiKeys.sendGrid = '';
      
      createSendGridService(configWithoutKey, mockLogger, mockDb, mockEmailValidator);
      
      expect(mockLogger.warn).toHaveBeenCalledWith('SendGrid API key not set. Email functionality will be disabled.');
    });
  });

  describe('validateApiKey', () => {
    test('should not throw when API key is set', () => {
      expect(() => sendGridService.validateApiKey()).not.toThrow();
    });

    test('should throw when API key is not set', () => {
      sendGridService.apiKey = '';
      
      expect(() => sendGridService.validateApiKey()).toThrow('SendGrid API key is not set');
    });
  });

  describe('isUnsubscribed', () => {
    test('should return true for null email', async () => {
      const result = await sendGridService.isUnsubscribed(null);
      expect(result).toBe(true);
    });

    test('should return true for empty email', async () => {
      const result = await sendGridService.isUnsubscribed('');
      expect(result).toBe(true);
    });

    test('should return false for email not in unsubscribe list', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      
      const result = await sendGridService.isUnsubscribed('test@example.com');
      
      expect(result).toBe(false);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM unsubscribe_list WHERE email = $1',
        ['test@example.com']
      );
    });

    test('should return true for email in unsubscribe list', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ email: 'test@example.com' }] });
      
      const result = await sendGridService.isUnsubscribed('test@example.com');
      
      expect(result).toBe(true);
    });

    test('should return true on database error', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));
      
      const result = await sendGridService.isUnsubscribed('test@example.com');
      
      expect(result).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('storeEmailEvent', () => {
    test('should store email event successfully', async () => {
      const mockEvent = { id: 'event-123' };
      mockDb.query.mockResolvedValue({ rows: [mockEvent] });
      
      const result = await sendGridService.storeEmailEvent(
        'job-123',
        'test@example.com',
        'sent',
        { messageId: 'msg-123' }
      );
      
      expect(result).toEqual(mockEvent);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO email_events'),
        ['job-123', 'test@example.com', 'sent', '{"messageId":"msg-123"}']
      );
    });

    test('should return null on database error', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));
      
      const result = await sendGridService.storeEmailEvent(
        'job-123',
        'test@example.com',
        'sent',
        {}
      );
      
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('preparePersonalizationData', () => {
    test('should prepare personalization data with all fields', () => {
      const job = {
        title: 'Software Engineer',
        company: 'Test Company',
        location: 'New York',
        job_url: 'https://example.com/job',
        contact_name: 'John Doe',
        company_data: JSON.stringify({ name: 'Test Corp' })
      };
      
      const contact = {
        firstName: 'Jane',
        email: 'jane@example.com'
      };
      
      const result = sendGridService.preparePersonalizationData(job, contact);
      
      expect(result).toEqual({
        first_name: 'Jane',
        company: 'Test Corp',
        role: 'Software Engineer',
        location: 'New York',
        job_url: 'https://example.com/job'
      });
    });

    test('should handle missing contact name', () => {
      const job = {
        title: 'Software Engineer',
        company: 'Test Company',
        contact_name: 'John Doe'
      };
      
      const contact = { email: 'test@example.com' };
      
      const result = sendGridService.preparePersonalizationData(job, contact);
      
      expect(result.first_name).toBe('John');
    });

    test('should use fallback values for missing data', () => {
      const job = {};
      const contact = {};
      
      const result = sendGridService.preparePersonalizationData(job, contact);
      
      expect(result).toEqual({
        first_name: 'Hiring Manager',
        company: 'your company',
        role: 'the role',
        location: 'not specified',
        job_url: '#'
      });
    });
  });

  describe('sendJobOutreach', () => {
    beforeEach(() => {
      // Mock queue email method
      sendGridService.queueEmail = jest.fn();
      mockDb.query.mockResolvedValue({ rows: [] });
    });

    test('should skip job without contact email', async () => {
      const job = { id: 'job-123', title: 'Test Job' };
      
      const result = await sendGridService.sendJobOutreach(job);
      
      expect(result).toEqual({ skipped: true, reason: 'no_contact_email' });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('should skip unsubscribed email', async () => {
      const job = {
        id: 'job-123',
        title: 'Test Job',
        contact_email: 'test@example.com'
      };
      
      // Mock isUnsubscribed to return true
      jest.spyOn(sendGridService, 'isUnsubscribed').mockResolvedValue(true);
      
      const result = await sendGridService.sendJobOutreach(job);
      
      expect(result).toEqual({ skipped: true, reason: 'email_unsubscribed' });
    });

    test('should queue email for valid job', async () => {
      const job = {
        id: 'job-123',
        title: 'Software Engineer',
        company: 'Test Company',
        contact_email: 'test@example.com',
        contact_name: 'John Doe'
      };
      
      // Mock isUnsubscribed to return false
      jest.spyOn(sendGridService, 'isUnsubscribed').mockResolvedValue(false);
      
      const result = await sendGridService.sendJobOutreach(job);
      
      expect(result).toEqual({
        queued: true,
        email: 'test@example.com',
        subject: 'Regarding the Software Engineer role at Test Company'
      });
      expect(sendGridService.queueEmail).toHaveBeenCalled();
    });
  });
}); 