/**
 * Rate Limiting Service
 * Tracks API usage and automatically switches to Apify fallbacks when limits are reached
 */

class RateLimiter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.usage = new Map(); // Track daily usage per API
    this.resetTime = this.getNextResetTime();
    
    // Initialize usage tracking
    this.initializeUsageTracking();
  }

  /**
   * Initialize usage tracking for all APIs
   */
  initializeUsageTracking() {
    const apis = ['serpApi', 'hunter', 'zeroBounce', 'sendGrid'];
    
    apis.forEach(api => {
      this.usage.set(api, {
        count: 0,
        lastReset: new Date(),
        enabled: this.config.rateLimits[api]?.enabled ?? true
      });
    });

    this.logger.info('Rate limiter initialized', {
      apis: apis.length,
      resetTime: this.resetTime
    });
  }

  /**
   * Get the next reset time (midnight UTC)
   */
  getNextResetTime() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Check if daily reset is needed
   */
  checkDailyReset() {
    const now = new Date();
    if (now >= this.resetTime) {
      this.resetDailyUsage();
      this.resetTime = this.getNextResetTime();
    }
  }

  /**
   * Reset daily usage counters
   */
  resetDailyUsage() {
    this.usage.forEach((data, api) => {
      data.count = 0;
      data.lastReset = new Date();
    });

    this.logger.info('Daily API usage counters reset');
  }

  /**
   * Check if an API can be used (within rate limits)
   * @param {string} apiName - Name of the API to check
   * @returns {Object} - {canUse: boolean, reason: string, fallback: string}
   */
  canUseAPI(apiName) {
    this.checkDailyReset();

    const apiConfig = this.config.rateLimits[apiName];
    const usage = this.usage.get(apiName);

    if (!apiConfig) {
      return {
        canUse: false,
        reason: `API ${apiName} not configured`,
        fallback: 'apify'
      };
    }

    if (!apiConfig.enabled) {
      return {
        canUse: false,
        reason: `API ${apiName} disabled due to rate limits`,
        fallback: apiConfig.fallbackToApify ? 'apify' : 'none'
      };
    }

    if (!usage) {
      this.logger.warn(`Usage tracking not found for API: ${apiName}`);
      return {
        canUse: false,
        reason: 'Usage tracking not initialized',
        fallback: 'apify'
      };
    }

    if (usage.count >= apiConfig.dailyLimit) {
      return {
        canUse: false,
        reason: `Daily limit reached (${usage.count}/${apiConfig.dailyLimit})`,
        fallback: apiConfig.fallbackToApify ? 'apify' : 'none'
      };
    }

    return {
      canUse: true,
      reason: `Within limits (${usage.count}/${apiConfig.dailyLimit})`,
      remaining: apiConfig.dailyLimit - usage.count
    };
  }

  /**
   * Record API usage
   * @param {string} apiName - Name of the API used
   * @param {number} count - Number of requests made (default: 1)
   */
  recordUsage(apiName, count = 1) {
    this.checkDailyReset();

    const usage = this.usage.get(apiName);
    if (usage) {
      usage.count += count;
      
      this.logger.info(`API usage recorded: ${apiName}`, {
        used: usage.count,
        limit: this.config.rateLimits[apiName]?.dailyLimit,
        remaining: this.config.rateLimits[apiName]?.dailyLimit - usage.count
      });

      // Warn when approaching limit
      const limit = this.config.rateLimits[apiName]?.dailyLimit;
      if (limit && usage.count >= limit * 0.8) {
        this.logger.warn(`API ${apiName} approaching daily limit`, {
          used: usage.count,
          limit: limit,
          remaining: limit - usage.count
        });
      }
    }
  }

  /**
   * Get usage statistics for all APIs
   * @returns {Object} - Usage statistics
   */
  getUsageStats() {
    this.checkDailyReset();

    const stats = {};
    this.usage.forEach((data, api) => {
      const config = this.config.rateLimits[api];
      stats[api] = {
        used: data.count,
        limit: config?.dailyLimit || 0,
        remaining: Math.max(0, (config?.dailyLimit || 0) - data.count),
        enabled: config?.enabled ?? true,
        lastReset: data.lastReset,
        percentage: config?.dailyLimit ? Math.round((data.count / config.dailyLimit) * 100) : 0
      };
    });

    return {
      stats,
      nextReset: this.resetTime,
      apifyFallbackAvailable: this.config.apify?.useApify ?? false
    };
  }

  /**
   * Get recommended scraping strategy based on current limits
   * @returns {Object} - Recommended strategy
   */
  getScrapingStrategy() {
    const serpCheck = this.canUseAPI('serpApi');
    const hunterCheck = this.canUseAPI('hunter');

    const strategy = {
      jobScraping: {
        primary: serpCheck.canUse ? 'serpApi' : 'apify',
        reason: serpCheck.canUse ? 'SerpAPI available' : serpCheck.reason,
        fallback: 'apify'
      },
      contactEnrichment: {
        primary: hunterCheck.canUse ? 'hunter' : 'apify',
        reason: hunterCheck.canUse ? 'Hunter.io available' : hunterCheck.reason,
        fallback: 'apify'
      },
      emailValidation: {
        primary: 'zeroBounce', // Usually has sufficient limits
        fallback: 'manual'
      },
      emailSending: {
        primary: 'sendGrid', // Usually has sufficient limits
        fallback: 'manual'
      }
    };

    this.logger.info('Scraping strategy determined', strategy);
    return strategy;
  }

  /**
   * Execute with rate limiting - automatically chooses best available API
   * @param {string} operation - Type of operation (jobScraping, contactEnrichment, etc.)
   * @param {Function} primaryFunction - Function to execute with primary API
   * @param {Function} fallbackFunction - Function to execute with Apify fallback
   * @returns {Promise} - Result of the operation
   */
  async executeWithRateLimit(operation, primaryFunction, fallbackFunction) {
    const strategy = this.getScrapingStrategy();
    const operationStrategy = strategy[operation];

    if (!operationStrategy) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    try {
      if (operationStrategy.primary !== 'apify') {
        this.logger.info(`Executing ${operation} with primary API: ${operationStrategy.primary}`);
        const result = await primaryFunction();
        this.recordUsage(operationStrategy.primary);
        return result;
      } else {
        this.logger.info(`Executing ${operation} with Apify fallback: ${operationStrategy.reason}`);
        return await fallbackFunction();
      }
    } catch (error) {
      this.logger.error(`Primary ${operation} failed, trying fallback`, { error: error.message });
      
      if (operationStrategy.fallback === 'apify' && fallbackFunction) {
        this.logger.info(`Falling back to Apify for ${operation}`);
        return await fallbackFunction();
      } else {
        throw error;
      }
    }
  }
}

module.exports = RateLimiter; 