/**
 * Caching utility for improving performance
 * Provides in-memory and database-backed caching for API responses and computed data
 */

class CacheManager {
  constructor(db, logger, config = {}) {
    this.db = db;
    this.logger = logger;
    this.config = {
      defaultTTL: config.defaultTTL || 3600, // 1 hour default
      maxMemoryItems: config.maxMemoryItems || 1000,
      cleanupInterval: config.cleanupInterval || 300000, // 5 minutes
      ...config
    };
    
    // In-memory cache for frequently accessed data
    this.memoryCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Get value from cache (memory first, then database)
   * @param {string} key - Cache key
   * @param {Object} options - Cache options
   * @returns {Promise<any>} Cached value or null
   */
  async get(key, options = {}) {
    try {
      // Check memory cache first
      const memoryResult = this.getFromMemory(key);
      if (memoryResult !== null) {
        this.cacheStats.hits++;
        this.logger.debug('Cache hit (memory)', { key, type: 'memory' });
        return memoryResult;
      }

      // Check database cache if enabled
      if (options.useDatabase !== false) {
        const dbResult = await this.getFromDatabase(key);
        if (dbResult !== null) {
          // Store in memory for faster future access
          this.setInMemory(key, dbResult, options.ttl);
          this.cacheStats.hits++;
          this.logger.debug('Cache hit (database)', { key, type: 'database' });
          return dbResult;
        }
      }

      this.cacheStats.misses++;
      this.logger.debug('Cache miss', { key });
      return null;
    } catch (error) {
      this.cacheStats.errors++;
      this.logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {Object} options - Cache options
   */
  async set(key, value, options = {}) {
    try {
      const ttl = options.ttl || this.config.defaultTTL;
      
      // Set in memory cache
      this.setInMemory(key, value, ttl);
      
      // Set in database cache if enabled
      if (options.useDatabase !== false) {
        await this.setInDatabase(key, value, ttl);
      }
      
      this.cacheStats.sets++;
      this.logger.debug('Cache set', { key, ttl, useDatabase: options.useDatabase !== false });
    } catch (error) {
      this.cacheStats.errors++;
      this.logger.error('Cache set error', { key, error: error.message });
    }
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   */
  async delete(key) {
    try {
      // Delete from memory
      this.memoryCache.delete(key);
      
      // Delete from database
      await this.deleteFromDatabase(key);
      
      this.cacheStats.deletes++;
      this.logger.debug('Cache delete', { key });
    } catch (error) {
      this.cacheStats.errors++;
      this.logger.error('Cache delete error', { key, error: error.message });
    }
  }

  /**
   * Get or set pattern - get value, or compute and cache if not found
   * @param {string} key - Cache key
   * @param {Function} computeFn - Function to compute value if not cached
   * @param {Object} options - Cache options
   * @returns {Promise<any>} Cached or computed value
   */
  async getOrSet(key, computeFn, options = {}) {
    let value = await this.get(key, options);
    
    if (value === null) {
      this.logger.debug('Computing value for cache', { key });
      value = await computeFn();
      
      if (value !== null && value !== undefined) {
        await this.set(key, value, options);
      }
    }
    
    return value;
  }

  /**
   * Clear all cache data
   */
  async clear() {
    try {
      // Clear memory cache
      this.memoryCache.clear();
      
      // Clear database cache
      await this.clearDatabase();
      
      this.logger.info('Cache cleared');
    } catch (error) {
      this.cacheStats.errors++;
      this.logger.error('Cache clear error', { error: error.message });
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const hitRate = this.cacheStats.hits + this.cacheStats.misses > 0 
      ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.cacheStats,
      hitRate: `${hitRate}%`,
      memoryItems: this.memoryCache.size,
      maxMemoryItems: this.config.maxMemoryItems
    };
  }

  // Private methods

  getFromMemory(key) {
    const item = this.memoryCache.get(key);
    if (!item) return null;
    
    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    
    return item.value;
  }

  setInMemory(key, value, ttl) {
    // Enforce memory limit
    if (this.memoryCache.size >= this.config.maxMemoryItems) {
      // Remove oldest item (simple LRU)
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    
    const expiresAt = Date.now() + (ttl * 1000);
    this.memoryCache.set(key, { value, expiresAt });
  }

  async getFromDatabase(key) {
    try {
      const result = await this.db.query(
        'SELECT value, expires_at FROM cache WHERE key = $1 AND expires_at > NOW()',
        [key]
      );
      
      if (result.rows.length === 0) return null;
      
      return JSON.parse(result.rows[0].value);
    } catch (error) {
      this.logger.error('Database cache get error', { key, error: error.message });
      return null;
    }
  }

  async setInDatabase(key, value, ttl) {
    try {
      const expiresAt = new Date(Date.now() + (ttl * 1000));
      
      await this.db.query(
        `INSERT INTO cache (key, value, expires_at, created_at) 
         VALUES ($1, $2, $3, NOW()) 
         ON CONFLICT (key) 
         DO UPDATE SET value = $2, expires_at = $3, updated_at = NOW()`,
        [key, JSON.stringify(value), expiresAt]
      );
    } catch (error) {
      this.logger.error('Database cache set error', { key, error: error.message });
    }
  }

  async deleteFromDatabase(key) {
    try {
      await this.db.query('DELETE FROM cache WHERE key = $1', [key]);
    } catch (error) {
      this.logger.error('Database cache delete error', { key, error: error.message });
    }
  }

  async clearDatabase() {
    try {
      await this.db.query('DELETE FROM cache');
    } catch (error) {
      this.logger.error('Database cache clear error', { error: error.message });
    }
  }

  startCleanupInterval() {
    setInterval(() => {
      this.cleanupExpiredItems();
    }, this.config.cleanupInterval);
  }

  cleanupExpiredItems() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, item] of this.memoryCache.entries()) {
      if (now > item.expiresAt) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.debug('Cleaned up expired cache items', { count: cleanedCount });
    }
    
    // Also cleanup database cache
    this.cleanupDatabaseCache();
  }

  async cleanupDatabaseCache() {
    try {
      const result = await this.db.query('DELETE FROM cache WHERE expires_at <= NOW()');
      if (result.rowCount > 0) {
        this.logger.debug('Cleaned up expired database cache items', { count: result.rowCount });
      }
    } catch (error) {
      this.logger.error('Database cache cleanup error', { error: error.message });
    }
  }
}

/**
 * Cache key generators for common use cases
 */
class CacheKeys {
  static company(domain) {
    return `company:${domain}`;
  }
  
  static email(domain, firstName, lastName) {
    return `email:${domain}:${firstName}:${lastName}`;
  }
  
  static emailValidation(email) {
    return `email_validation:${email}`;
  }
  
  static domainPattern(domain) {
    return `domain_pattern:${domain}`;
  }
  
  static jobEnrichment(jobId) {
    return `job_enrichment:${jobId}`;
  }
  
  static apiResponse(service, endpoint, params) {
    const paramString = JSON.stringify(params);
    return `api:${service}:${endpoint}:${Buffer.from(paramString).toString('base64')}`;
  }
}

module.exports = { CacheManager, CacheKeys }; 