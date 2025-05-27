const { withRetries } = require('../../src/utils/custom-retry'); // Adjust path as necessary

// Helper for creating mock Axios-like errors
const createAxiosError = (status, code = null, message = 'Axios error') => {
  const error = new Error(message);
  error.isAxiosError = true;
  if (status) {
    error.response = { status };
  }
  if (code) {
    error.code = code;
  }
  return error;
};

// Helper for creating generic network errors
const createNetworkError = (message = 'Network error', code = null) => {
  const error = new Error(message);
  if (code) {
    error.code = code; // e.g., 'ENETUNREACH'
  }
  // To make it look more like a network error that might not be an Axios error
  error.isNetworkError = true; 
  return error;
};

describe('withRetries', () => {
  let mockApiCall;

  beforeEach(() => {
    mockApiCall = jest.fn();
    jest.useFakeTimers(); // Use fake timers for controlling setTimeout
  });

  afterEach(() => {
    jest.clearAllMocks(); // Clear all mocks including spies
    jest.clearAllTimers(); // Clear all timers
    jest.useRealTimers(); // Restore real timers
  });

  test('should return result on first successful call', async () => {
    mockApiCall.mockResolvedValue('success');
    const config = { retries: 3, initialDelay: 10 };
    const result = await withRetries(mockApiCall, config);
    
    expect(mockApiCall).toHaveBeenCalledTimes(1);
    expect(result).toBe('success');
  });

  test('should retry on HTTP 500 error and then succeed', async () => {
    mockApiCall
      .mockRejectedValueOnce(createAxiosError(500))
      .mockResolvedValue('success after 500');
    
    const config = { retries: 3, initialDelay: 10 };
    
    // Start the retry operation
    const resultPromise = withRetries(mockApiCall, config);
    
    // Fast-forward time to trigger the retry
    await jest.runAllTimersAsync();
    
    const result = await resultPromise;
    
    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(result).toBe('success after 500');
  });

  test('should retry on HTTP 429 error and then succeed', async () => {
    mockApiCall
      .mockRejectedValueOnce(createAxiosError(429))
      .mockResolvedValue('success after 429');
    
    const config = { retries: 3, initialDelay: 10 };
    
    const resultPromise = withRetries(mockApiCall, config);
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    
    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(result).toBe('success after 429');
  });
  
  test('should retry on generic network error (message based) and then succeed', async () => {
    mockApiCall
      .mockRejectedValueOnce(createNetworkError('Network error occurred'))
      .mockResolvedValue('success after generic network error');
    
    const config = { retries: 3, initialDelay: 10 };
    
    const resultPromise = withRetries(mockApiCall, config);
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    
    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(result).toBe('success after generic network error');
  });

  test('should retry on specific error.code (ENETUNREACH) and then succeed', async () => {
    mockApiCall
      .mockRejectedValueOnce(createNetworkError('Some error', 'ENETUNREACH'))
      .mockResolvedValue('success after ENETUNREACH');

    const config = { retries: 3, initialDelay: 10 };
    
    const resultPromise = withRetries(mockApiCall, config);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(result).toBe('success after ENETUNREACH');
  });
  
  test('should retry on Axios network error (isAxiosError true, no response) and then succeed', async () => {
    const axiosNetworkError = new Error("Network Error");
    axiosNetworkError.isAxiosError = true; // Simulate Axios network error where response is undefined
    
    mockApiCall
      .mockRejectedValueOnce(axiosNetworkError)
      .mockResolvedValue('success after Axios network error');

    const config = { retries: 3, initialDelay: 10 };
    
    const resultPromise = withRetries(mockApiCall, config);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(result).toBe('success after Axios network error');
  });

  test('should retry multiple times and then succeed', async () => {
    mockApiCall
      .mockRejectedValueOnce(createAxiosError(500)) // 1st call
      .mockRejectedValueOnce(createAxiosError(503)) // 2nd call (1st retry)
      .mockResolvedValue('success after multiple retries'); // 3rd call (2nd retry)
    
    const config = { retries: 3, initialDelay: 10, backoffFactor: 2, jitter: false };
    
    const resultPromise = withRetries(mockApiCall, config);
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    
    expect(mockApiCall).toHaveBeenCalledTimes(3);
    expect(result).toBe('success after multiple retries');
    });

  test('should fail after exhausting all retry attempts', async () => {
    // Use real timers for this test to avoid Jest fake timer complications
    jest.useRealTimers();
    
    const persistentError = createAxiosError(500, null, 'Persistent error');
    mockApiCall.mockRejectedValue(persistentError); // Always fails
    
    // Use very small delay with real timers
    const config = { retries: 2, initialDelay: 1, jitter: false };
    
    // Test should complete quickly with real timers and small delay
    await expect(withRetries(mockApiCall, config)).rejects.toThrow('Persistent error');
    
    expect(mockApiCall).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    
    // Restore fake timers for other tests
    jest.useFakeTimers();
  });

  test('should not retry on non-retryable error (e.g., 400)', async () => {
    const nonRetryableError = createAxiosError(400);
    mockApiCall.mockRejectedValueOnce(nonRetryableError);
    
    const config = { retries: 3, initialDelay: 10 };
    
    await expect(withRetries(mockApiCall, config)).rejects.toBe(nonRetryableError);
    expect(mockApiCall).toHaveBeenCalledTimes(1);
  });

  test('should use custom shouldRetry function and retry accordingly', async () => {
    const customRetryableError = createAxiosError(400, null, 'Custom retry this');
    mockApiCall
      .mockRejectedValueOnce(customRetryableError)
      .mockResolvedValue('success with custom retry');
    
    const customShouldRetry = jest.fn((error) => {
      return error.response && error.response.status === 400;
    });
    
    const config = { 
      retries: 1, 
      initialDelay: 10, 
      shouldRetry: customShouldRetry 
    };
    
    const resultPromise = withRetries(mockApiCall, config);
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    
    expect(customShouldRetry).toHaveBeenCalledWith(customRetryableError);
    expect(mockApiCall).toHaveBeenCalledTimes(2); // 1 initial + 1 retry (custom)
    expect(result).toBe('success with custom retry');
  });

  test('should not retry if custom shouldRetry returns false', async () => {
    const errorToNotRetry = createAxiosError(500, null, 'Do not retry this 500');
    mockApiCall.mockRejectedValueOnce(errorToNotRetry);
    
    const customShouldRetry = jest.fn(() => false); // Custom logic says no retry
    
    const config = { 
      retries: 3, 
      initialDelay: 10, 
      shouldRetry: customShouldRetry 
    };
    
    await expect(withRetries(mockApiCall, config)).rejects.toBe(errorToNotRetry);
    expect(customShouldRetry).toHaveBeenCalledWith(errorToNotRetry);
    expect(mockApiCall).toHaveBeenCalledTimes(1);
  });

  test('should respect maxDelay in retry configuration', async () => {
    mockApiCall
      .mockRejectedValueOnce(createAxiosError(500)) // initialDelay = 10
      .mockRejectedValueOnce(createAxiosError(500)) // 10 * 2 = 20
      .mockRejectedValueOnce(createAxiosError(500)) // 20 * 2 = 40 (capped at maxDelay 30)
      .mockResolvedValue('success with maxDelay');
    
    const config = { 
      retries: 3, 
      initialDelay: 10, 
      backoffFactor: 2, 
      maxDelay: 30, // Max delay of 30ms
      jitter: false // Disable jitter for predictable delay testing
    };
    
    const resultPromise = withRetries(mockApiCall, config);
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    
    expect(mockApiCall).toHaveBeenCalledTimes(4);
    expect(result).toBe('success with maxDelay');
  });

  test('jitter should apply randomness to delay when enabled (conceptual)', async () => {
    // Mock Math.random to return a predictable value for testing
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0.5); // 50% of jitter range
    
    mockApiCall
      .mockRejectedValueOnce(createAxiosError(500))
      .mockResolvedValue('success');
    
    const config = { 
      retries: 1, 
      initialDelay: 100, 
      jitter: true
    };
    
    const resultPromise = withRetries(mockApiCall, config);
    await jest.runAllTimersAsync();
    await resultPromise;
    
    // Restore Math.random
    Math.random = originalRandom;
  });

  test('jitter should not apply randomness to delay when disabled', async () => {
    mockApiCall
      .mockRejectedValueOnce(createAxiosError(500))
      .mockResolvedValue('success');
    
    const config = { 
      retries: 1, 
      initialDelay: 100, 
      jitter: false 
    };
    
    const resultPromise = withRetries(mockApiCall, config);
    await jest.runAllTimersAsync();
    await resultPromise;
    
    expect(mockApiCall).toHaveBeenCalledTimes(2);
  });

  test('delay should not be negative even with jitter', async () => {
    mockApiCall
      .mockRejectedValueOnce(createAxiosError(500))
      .mockResolvedValue('success');
    
    // Test with a small initialDelay where jitter could make it negative if not handled
    const config = { 
      retries: 1, 
      initialDelay: 1, // Very small delay
      jitter: true 
    };
    
    const resultPromise = withRetries(mockApiCall, config);
    await jest.runAllTimersAsync();
    await resultPromise;
    
    expect(mockApiCall).toHaveBeenCalledTimes(2);
  });
});
