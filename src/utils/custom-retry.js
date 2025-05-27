/**
 * @async
 * @function withRetries
 * @description Executes an asynchronous function with a retry mechanism.
 * @param {() => Promise<any>} asyncFn - The asynchronous function to execute.
 * @param {object} config - Configuration for the retry mechanism.
 * @param {number} config.retries - Maximum number of retry attempts.
 * @param {number} config.initialDelay - Initial delay in milliseconds for the first retry.
 * @param {number} [config.maxDelay=Infinity] - Maximum delay in milliseconds between retries.
 * @param {number} [config.backoffFactor=2] - Multiplier for the delay (e.g., 2 for exponential backoff).
 * @param {boolean} [config.jitter=true] - Whether to add a random jitter to the delay.
 * @param {(error: any) => boolean} [config.shouldRetry] - A function that determines if a retry should occur based on the error.
 * @returns {Promise<any>} A promise that resolves with the result of `asyncFn` or rejects if retries are exhausted.
 * @throws {Error} Throws the last error encountered if retries are exhausted or shouldRetry returns false.
 */
async function withRetries(asyncFn, config) {
  const {
    retries,
    initialDelay,
    maxDelay = Infinity,
    backoffFactor = 2,
    jitter = true,
    shouldRetry: customShouldRetry,
  } = config;

  let attempts = 0;
  let currentDelay = initialDelay;

  const defaultShouldRetry = (error) => {
    // Retry on network errors (error.response might not be available)
    if (!error.response && error.isAxiosError) {
      // Axios specific network error (e.g. ECONNREFUSED)
      return true;
    }
    if (!error.response && error.message && error.message.toLowerCase().includes('network error')) {
        // Generic network error
        return true;
    }
    if (error.code && ['ENETUNREACH', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) {
        // Node.js specific network errors
        return true;
    }

    if (error.response) {
      // Retry on specific HTTP status codes
      const retryableStatusCodes = [429, 500, 502, 503, 504];
      return retryableStatusCodes.includes(error.response.status);
    }
    // If not an HTTP error with a response, or a recognized network error, don't retry by default
    return false;
  };

  const shouldRetry = customShouldRetry || defaultShouldRetry;

  while (attempts <= retries) {
    try {
      return await asyncFn();
    } catch (error) {
      attempts++;
      if (attempts > retries || !shouldRetry(error)) {
        throw error;
      }

      let delay = Math.min(maxDelay, initialDelay * Math.pow(backoffFactor, attempts - 1));

      if (jitter) {
        const jitterAmount = delay * 0.2; // +/- 20%
        // Apply jitter: currentDelay +/- jitterAmount
        delay += (Math.random() * jitterAmount * 2) - jitterAmount;
        delay = Math.max(0, delay); // Ensure delay is not negative
      }
      
      currentDelay = delay; // Update currentDelay for the next potential calculation

      // Always use setTimeout - Jest's fake timers will handle this properly in tests
      await new Promise(resolve => setTimeout(resolve, Math.max(0, delay)));
    }
  }
  // This line should theoretically be unreachable if retries >= 0,
  // as the loop condition (attempts <= retries) and the throw inside the catch
  // should handle all cases. However, to satisfy linters or strict type checking,
  // and as a fallback, we can throw an error.
  throw new Error('Retry attempts exhausted. This should not be reached.');
}

module.exports = { withRetries };
