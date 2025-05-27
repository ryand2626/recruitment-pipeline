const axios = require('axios');
const ClearbitServiceFactory = require('../../src/enrichment/clearbit-service'); // Adjust path

jest.mock('axios'); // Mock axios module

// Helper for creating mock Axios-like errors
const createAxiosError = (status, data = null, message = `Request failed with status code ${status}`) => {
  const error = new Error(message);
  error.isAxiosError = true;
  error.response = { status, data };
  return error;
};

describe('ClearbitService - enrichCompany Retry Logic', () => {
  let clearbitService;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    mockConfig = {
      apiKeys: { clearbit: 'test-key' },
      baseUrl: 'https://company.clearbit.com/v2', // Assuming this is how it's set or used internally
      retryConfig: {
        default: { retries: 3, initialDelayMs: 10, backoffFactor: 1, maxDelayMs: 50, jitter: false },
        services: { 
          clearbit: {} // Uses default or can be overridden per test
        }
      }
    };
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    clearbitService = ClearbitServiceFactory(mockConfig, mockLogger);
    jest.useFakeTimers();
    // No need to spy on setTimeout if we are not verifying its calls directly here,
    // as withRetries is already tested for that. We focus on axios.get calls.
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('enrichCompany should return data on successful first call', async () => {
    const mockCompanyData = { id: '123', name: 'TestCo' };
    axios.get.mockResolvedValue({ status: 200, data: mockCompanyData });

    const data = await clearbitService.enrichCompany('test.com');

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith(
      'https://company.clearbit.com/v2/companies/find',
      expect.objectContaining({
        params: { domain: 'test.com' },
        headers: { Authorization: 'Bearer test-key' },
      })
    );
    expect(data).toEqual(mockCompanyData);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('enrichCompany should retry on 500 error and then succeed', async () => {
    const mockCompanyData = { id: '123', name: 'TestCo' };
    axios.get
      .mockRejectedValueOnce(createAxiosError(500)) // Fails once
      .mockResolvedValue({ status: 200, data: mockCompanyData }); // Succeeds

    // Override service specific retry config for this test
    mockConfig.retryConfig.services.clearbit = { retries: 1, initialDelayMs: 10, jitter: false }; 
    clearbitService = ClearbitServiceFactory(mockConfig, mockLogger); // Re-initialize with new config

    const resultPromise = clearbitService.enrichCompany('test.com');
    await jest.runAllTimersAsync(); // Process all timers for retries
    const data = await resultPromise;

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(data).toEqual(mockCompanyData);
    expect(mockLogger.error).not.toHaveBeenCalled(); // Final outcome is success
  });

  test('enrichCompany should retry on 429 error and then succeed', async () => {
    const mockCompanyData = { id: '123', name: 'TestCo' };
    axios.get
      .mockRejectedValueOnce(createAxiosError(429)) // Fails once
      .mockResolvedValue({ status: 200, data: mockCompanyData }); // Succeeds

    mockConfig.retryConfig.services.clearbit = { retries: 1, initialDelayMs: 10, jitter: false };
    clearbitService = ClearbitServiceFactory(mockConfig, mockLogger);

    const resultPromise = clearbitService.enrichCompany('test.com');
    await jest.runAllTimersAsync();
    const data = await resultPromise;

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(data).toEqual(mockCompanyData);
  });

  test('enrichCompany should retry and exhaust attempts on persistent 500 error', async () => {
    axios.get.mockRejectedValue(createAxiosError(500)); // Consistently fails

    mockConfig.retryConfig.services.clearbit = { retries: 2, initialDelayMs: 10, jitter: false };
    clearbitService = ClearbitServiceFactory(mockConfig, mockLogger);

    const resultPromise = clearbitService.enrichCompany('test.com');
    await jest.runAllTimersAsync(); // Process all retry timers
    const data = await resultPromise;

    expect(axios.get).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(data).toBeNull(); // Service returns null on exhausted retries for 500
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error enriching company data with Clearbit after retries',
      expect.objectContaining({
        domain: 'test.com',
        errorMessage: 'Request failed with status code 500',
      })
    );
  });
  
  test('enrichCompany should return null on 404 (non-retryable) without retrying', async () => {
    axios.get.mockRejectedValue(createAxiosError(404));
    
    // Default config should not retry 404
    clearbitService = ClearbitServiceFactory(mockConfig, mockLogger);

    const data = await clearbitService.enrichCompany('notfound.com');

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(data).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'No company data found via Clearbit for domain: notfound.com'
    );
    expect(mockLogger.error).not.toHaveBeenCalledWith( // Ensure the "after retries" error isn't logged
        expect.stringContaining('after retries'), 
        expect.anything()
    );
  });

  test('enrichCompany should return null on 422 (non-retryable) without retrying', async () => {
    axios.get.mockRejectedValue(createAxiosError(422));

    // Default config should not retry 422
    clearbitService = ClearbitServiceFactory(mockConfig, mockLogger);

    const data = await clearbitService.enrichCompany('invalid-domain');

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(data).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Invalid domain format for Clearbit: invalid-domain'
    );
     expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('after retries'), 
        expect.anything()
    );
  });

  test('enrichCompany should return null if API key is missing', async () => {
    mockConfig.apiKeys.clearbit = ''; // No API key
    clearbitService = ClearbitServiceFactory(mockConfig, mockLogger);

    await expect(clearbitService.enrichCompany('test.com')).rejects.toThrow('Clearbit API key is not set');
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('enrichCompany should handle unexpected error structure during retryable error', async () => {
    // Simulate an error that is retryable by status code but doesn't have error.response
    // The default shouldRetry in custom-retry expects error.response for status checks.
    // If error.response is missing, it might not retry as expected for status-based retries.
    // This test checks if the service handles it gracefully (e.g., by eventually failing if not retried).
    const malformedRetryableError = new Error("Network issue, but no response object");
    malformedRetryableError.isAxiosError = true;
    // No error.response means default shouldRetry might not see it as a 500/429.
    // However, the custom-retry's defaultShouldRetry also checks for `!error.response && error.isAxiosError`
    // which should make this retryable.

    axios.get
      .mockRejectedValueOnce(malformedRetryableError)
      .mockResolvedValue({ status: 200, data: { name: 'Success Co' } });

    mockConfig.retryConfig.services.clearbit = { retries: 1, initialDelayMs: 10, jitter: false };
    clearbitService = ClearbitServiceFactory(mockConfig, mockLogger);
    
    const resultPromise = clearbitService.enrichCompany('test.com');
    await jest.runAllTimersAsync();
    const data = await resultPromise;

    expect(axios.get).toHaveBeenCalledTimes(2); // It should have retried due to `!error.response && error.isAxiosError`
    expect(data).toEqual({ name: 'Success Co' });
  });

  test('enrichCompany logs warning and returns null on 429 if retries exhausted', async () => {
    axios.get.mockRejectedValue(createAxiosError(429)); // Consistently fails with 429

    mockConfig.retryConfig.services.clearbit = { retries: 2, initialDelayMs: 10, jitter: false };
    clearbitService = ClearbitServiceFactory(mockConfig, mockLogger);

    const resultPromise = clearbitService.enrichCompany('ratelimited.com');
    await jest.runAllTimersAsync(); // Process all retry timers
    const data = await resultPromise;

    expect(axios.get).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(data).toBeNull(); // Service returns null on exhausted retries for 429 specifically
    
    // Check that the warning for 429 rate limit is logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Clearbit rate limit exceeded for domain: ratelimited.com. This might indicate retries were exhausted for a 429 error.'
    );
    
    // For 429 errors, the service handles them specifically and returns null without logging the general error
    // The general error log is NOT called for 429 because it's handled in the specific if block
    expect(mockLogger.error).not.toHaveBeenCalledWith(
      'Error enriching company data with Clearbit after retries',
      expect.anything()
    );
  });

});
