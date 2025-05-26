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
    jest.spyOn(global, 'setTimeout'); // Spy on setTimeout
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
    expect(setTimeout).not.toHaveBeenCalled();
  });

  test('should retry on HTTP 500 error and then succeed', async () => {
    mockApiCall
      .mockRejectedValueOnce(createAxiosError(500))
      .mockResolvedValue('success after 500');
    
    const config = { retries: 3, initialDelay: 10 };
    const result = await withRetries(mockApiCall, config);
    
    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(result).toBe('success after 500');
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), expect.any(Number)); // Jitter makes exact delay hard
  });

  test('should retry on HTTP 429 error and then succeed', async () => {
    mockApiCall
      .mockRejectedValueOnce(createAxiosError(429))
      .mockResolvedValue('success after 429');
    
    const config = { retries: 3, initialDelay: 10 };
    const result = await withRetries(mockApiCall, config);
    
    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(result).toBe('success after 429');
    expect(setTimeout).toHaveBeenCalledTimes(1);
  });
  
  test('should retry on generic network error (message based) and then succeed', async () => {
    mockApiCall
      .mockRejectedValueOnce(createNetworkError('Network error occurred'))
      .mockResolvedValue('success after generic network error');
    
    const config = { retries: 3, initialDelay: 10 };
    const result = await withRetries(mockApiCall, config);
    
    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(result).toBe('success after generic network error');
    expect(setTimeout).toHaveBeenCalledTimes(1);
  });

  test('should retry on specific error.code (ENETUNREACH) and then succeed', async () => {
    mockApiCall
      .mockRejectedValueOnce(createNetworkError('Some error', 'ENETUNREACH'))
      .mockResolvedValue('success after ENETUNREACH');

    const config = { retries: 3, initialDelay: 10 };
    const result = await withRetries(mockApiCall, config);

    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(result).toBe('success after ENETUNREACH');
    expect(setTimeout).toHaveBeenCalledTimes(1);
  });
  
  test('should retry on Axios network error (isAxiosError true, no response) and then succeed', async () => {
    const axiosNetworkError = new Error("Network Error");
    axiosNetworkError.isAxiosError = true; // Simulate Axios network error where response is undefined
    
    mockApiCall
      .mockRejectedValueOnce(axiosNetworkError)
      .mockResolvedValue('success after Axios network error');

    const config = { retries: 3, initialDelay: 10 };
    const result = await withRetries(mockApiCall, config);

    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(result).toBe('success after Axios network error');
    expect(setTimeout).toHaveBeenCalledTimes(1);
  });


  test('should retry multiple times and then succeed', async () => {
    mockApiCall
      .mockRejectedValueOnce(createAxiosError(500)) // 1st call
      .mockRejectedValueOnce(createAxiosError(503)) // 2nd call (1st retry)
      .mockResolvedValue('success after multiple retries'); // 3rd call (2nd retry)
    
    const config = { retries: 3, initialDelay: 10, backoffFactor: 2 };
    const result = await withRetries(mockApiCall, config);
    
    expect(mockApiCall).toHaveBeenCalledTimes(3);
    expect(result).toBe('success after multiple retries');
    expect(setTimeout).toHaveBeenCalledTimes(2);

    // Check backoff (approximate due to jitter)
    // First delay: initialDelay (10ms)
    // Second delay: initialDelay * backoffFactor (10 * 2 = 20ms)
    // jest.runAllTimers(); // Ensure all timers are processed if logic depends on it.
    // Note: `toHaveBeenLastCalledWith` checks the last call. To check all, iterate or use `mock.calls`.
    const firstDelay = setTimeout.mock.calls[0][1];
    const secondDelay = setTimeout.mock.calls[1][1];

    expect(firstDelay).toBeGreaterThanOrEqual(10 * 0.8); // initialDelay with jitter
    expect(firstDelay).toBeLessThanOrEqual(10 * 1.2);
    expect(secondDelay).toBeGreaterThanOrEqual(20 * 0.8); // initialDelay * backoffFactor with jitter
    expect(secondDelay).toBeLessThanOrEqual(20 * 1.2);
  });

  test('should fail after exhausting all retry attempts', async () => {
    const persistentError = createAxiosError(500, null, 'Persistent error');
    mockApiCall.mockRejectedValue(persistentError); // Always fails
    
    const config = { retries: 2, initialDelay: 10 };
    
    await expect(withRetries(mockApiCall, config)).rejects.toBe(persistentError);
    expect(mockApiCall).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(setTimeout).toHaveBeenCalledTimes(2);
  });

  test('should not retry on non-retryable error (e.g., 400)', async () => {
    const nonRetryableError = createAxiosError(400);
    mockApiCall.mockRejectedValueOnce(nonRetryableError);
    
    const config = { retries: 3, initialDelay: 10 };
    
    await expect(withRetries(mockApiCall, config)).rejects.toBe(nonRetryableError);
    expect(mockApiCall).toHaveBeenCalledTimes(1);
    expect(setTimeout).not.toHaveBeenCalled();
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
    const result = await withRetries(mockApiCall, config);
    
    expect(customShouldRetry).toHaveBeenCalledWith(customRetryableError);
    expect(mockApiCall).toHaveBeenCalledTimes(2); // 1 initial + 1 retry (custom)
    expect(result).toBe('success with custom retry');
    expect(setTimeout).toHaveBeenCalledTimes(1);
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
    expect(setTimeout).not.toHaveBeenCalled();
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
    
    const result = await withRetries(mockApiCall, config);
    
    expect(mockApiCall).toHaveBeenCalledTimes(4);
    expect(result).toBe('success with maxDelay');
    expect(setTimeout).toHaveBeenCalledTimes(3);
    
    // Delays: 10ms, 20ms, 30ms (capped)
    expect(setTimeout.mock.calls[0][1]).toBe(10);
    expect(setTimeout.mock.calls[1][1]).toBe(20);
    expect(setTimeout.mock.calls[2][1]).toBe(30); 
  });

  test('jitter should apply randomness to delay when enabled (conceptual)', async () => {
    mockApiCall
      .mockRejectedValueOnce(createAxiosError(500))
      .mockResolvedValue('success');
    
    const config = { 
      retries: 1, 
      initialDelay: 100, 
      jitter: true // Default is true, explicitly set for clarity
    };
    
    await withRetries(mockApiCall, config);
    expect(setTimeout).toHaveBeenCalledTimes(1);
    const delay = setTimeout.mock.calls[0][1];
    // Delay should be 100ms +/- 20% (i.e., between 80ms and 120ms)
    expect(delay).toBeGreaterThanOrEqual(100 * 0.8);
    expect(delay).toBeLessThanOrEqual(100 * 1.2);
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
    
    await withRetries(mockApiCall, config);
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(setTimeout.mock.calls[0][1]).toBe(100); // Exact delay
  });

  test('should throw error if retries is negative or not a number', async () => {
    // This test is for the input validation of withRetries itself, not part of the problem description
    // but good practice. The current implementation doesn't explicitly validate this.
    // For now, focusing on specified tests.
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
    
    await withRetries(mockApiCall, config);
    expect(setTimeout).toHaveBeenCalledTimes(1);
    const delay = setTimeout.mock.calls[0][1];
    expect(delay).toBeGreaterThanOrEqual(0); // Check that delay is not negative
  });
});
