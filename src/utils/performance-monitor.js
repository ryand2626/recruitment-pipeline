/**
 * Performance monitoring utility
 * Tracks application metrics, response times, and resource usage
 */

class PerformanceMonitor {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.config = {
      enableMetrics: config.enableMetrics !== false,
      metricsInterval: config.metricsInterval || 60000, // 1 minute
      slowQueryThreshold: config.slowQueryThreshold || 1000, // 1 second
      memoryWarningThreshold: config.memoryWarningThreshold || 500 * 1024 * 1024, // 500MB
      ...config
    };
    
    this.metrics = {
      requests: new Map(),
      queries: new Map(),
      apiCalls: new Map(),
      errors: new Map(),
      performance: {
        startTime: Date.now(),
        totalRequests: 0,
        totalErrors: 0,
        averageResponseTime: 0,
        peakMemoryUsage: 0
      }
    };
    
    this.activeOperations = new Map();
    
    if (this.config.enableMetrics) {
      this.startMetricsCollection();
    }
  }

  /**
   * Start timing an operation
   * @param {string} operationId - Unique identifier for the operation
   * @param {string} type - Type of operation (request, query, api_call, etc.)
   * @param {Object} metadata - Additional metadata
   * @returns {string} Operation ID for stopping the timer
   */
  startTimer(operationId, type, metadata = {}) {
    const startTime = process.hrtime.bigint();
    
    this.activeOperations.set(operationId, {
      type,
      startTime,
      metadata
    });
    
    this.logger.debug('Performance timer started', { operationId, type, metadata });
    return operationId;
  }

  /**
   * Stop timing an operation and record metrics
   * @param {string} operationId - Operation ID from startTimer
   * @param {Object} result - Operation result metadata
   */
  stopTimer(operationId, result = {}) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      this.logger.warn('Performance timer not found', { operationId });
      return;
    }
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - operation.startTime) / 1000000; // Convert to milliseconds
    
    this.recordMetric(operation.type, operationId, duration, {
      ...operation.metadata,
      ...result
    });
    
    this.activeOperations.delete(operationId);
    
    // Log slow operations
    if (duration > this.config.slowQueryThreshold) {
      this.logger.warn('Slow operation detected', {
        operationId,
        type: operation.type,
        duration: `${duration.toFixed(2)}ms`,
        metadata: operation.metadata
      });
    }
    
    this.logger.debug('Performance timer stopped', {
      operationId,
      type: operation.type,
      duration: `${duration.toFixed(2)}ms`
    });
  }

  /**
   * Record a metric
   * @param {string} type - Metric type
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {Object} metadata - Additional metadata
   */
  recordMetric(type, operation, duration, metadata = {}) {
    const metricMap = this.getMetricMap(type);
    
    if (!metricMap.has(operation)) {
      metricMap.set(operation, {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        errors: 0,
        lastExecuted: null
      });
    }
    
    const metric = metricMap.get(operation);
    metric.count++;
    metric.totalDuration += duration;
    metric.averageDuration = metric.totalDuration / metric.count;
    metric.minDuration = Math.min(metric.minDuration, duration);
    metric.maxDuration = Math.max(metric.maxDuration, duration);
    metric.lastExecuted = new Date();
    
    if (metadata.error) {
      metric.errors++;
      this.metrics.performance.totalErrors++;
    }
    
    this.metrics.performance.totalRequests++;
    this.updateAverageResponseTime(duration);
  }

  /**
   * Record an error
   * @param {string} type - Error type
   * @param {string} operation - Operation name
   * @param {Error} error - Error object
   */
  recordError(type, operation, error) {
    const errorKey = `${type}:${operation}`;
    
    if (!this.metrics.errors.has(errorKey)) {
      this.metrics.errors.set(errorKey, {
        count: 0,
        lastError: null,
        lastOccurred: null
      });
    }
    
    const errorMetric = this.metrics.errors.get(errorKey);
    errorMetric.count++;
    errorMetric.lastError = error.message;
    errorMetric.lastOccurred = new Date();
    
    this.logger.error('Performance error recorded', {
      type,
      operation,
      error: error.message,
      count: errorMetric.count
    });
  }

  /**
   * Get performance metrics
   * @param {string} type - Optional metric type filter
   * @returns {Object} Performance metrics
   */
  getMetrics(type = null) {
    const result = {
      performance: this.metrics.performance,
      uptime: Date.now() - this.metrics.performance.startTime,
      memoryUsage: process.memoryUsage(),
      activeOperations: this.activeOperations.size
    };
    
    if (type) {
      const metricMap = this.getMetricMap(type);
      result[type] = Object.fromEntries(metricMap);
    } else {
      result.requests = Object.fromEntries(this.metrics.requests);
      result.queries = Object.fromEntries(this.metrics.queries);
      result.apiCalls = Object.fromEntries(this.metrics.apiCalls);
      result.errors = Object.fromEntries(this.metrics.errors);
    }
    
    return result;
  }

  /**
   * Get top slow operations
   * @param {number} limit - Number of operations to return
   * @returns {Array} Top slow operations
   */
  getSlowOperations(limit = 10) {
    const allOperations = [];
    
    for (const [type, metricMap] of [
      ['requests', this.metrics.requests],
      ['queries', this.metrics.queries],
      ['apiCalls', this.metrics.apiCalls]
    ]) {
      for (const [operation, metric] of metricMap) {
        allOperations.push({
          type,
          operation,
          averageDuration: metric.averageDuration,
          maxDuration: metric.maxDuration,
          count: metric.count,
          errors: metric.errors
        });
      }
    }
    
    return allOperations
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, limit);
  }

  /**
   * Get error summary
   * @returns {Object} Error summary
   */
  getErrorSummary() {
    const summary = {
      totalErrors: this.metrics.performance.totalErrors,
      errorRate: this.metrics.performance.totalRequests > 0 
        ? (this.metrics.performance.totalErrors / this.metrics.performance.totalRequests * 100).toFixed(2)
        : 0,
      topErrors: []
    };
    
    const sortedErrors = Array.from(this.metrics.errors.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10);
    
    summary.topErrors = sortedErrors.map(([key, error]) => ({
      operation: key,
      count: error.count,
      lastError: error.lastError,
      lastOccurred: error.lastOccurred
    }));
    
    return summary;
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.metrics.requests.clear();
    this.metrics.queries.clear();
    this.metrics.apiCalls.clear();
    this.metrics.errors.clear();
    
    this.metrics.performance = {
      startTime: Date.now(),
      totalRequests: 0,
      totalErrors: 0,
      averageResponseTime: 0,
      peakMemoryUsage: 0
    };
    
    this.logger.info('Performance metrics reset');
  }

  /**
   * Create a middleware for Express to automatically track request performance
   * @returns {Function} Express middleware
   */
  createExpressMiddleware() {
    return (req, res, next) => {
      const operationId = `${req.method}:${req.path}:${Date.now()}`;
      
      this.startTimer(operationId, 'requests', {
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent')
      });
      
      const originalSend = res.send;
      res.send = function(data) {
        this.stopTimer(operationId, {
          statusCode: res.statusCode,
          responseSize: data ? data.length : 0
        });
        
        return originalSend.call(res, data);
      }.bind(this);
      
      next();
    };
  }

  // Private methods

  getMetricMap(type) {
    switch (type) {
      case 'requests':
        return this.metrics.requests;
      case 'queries':
        return this.metrics.queries;
      case 'apiCalls':
        return this.metrics.apiCalls;
      default:
        return this.metrics.requests;
    }
  }

  updateAverageResponseTime(duration) {
    const total = this.metrics.performance.totalRequests;
    const current = this.metrics.performance.averageResponseTime;
    this.metrics.performance.averageResponseTime = 
      ((current * (total - 1)) + duration) / total;
  }

  startMetricsCollection() {
    setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.metricsInterval);
    
    this.logger.info('Performance metrics collection started', {
      interval: this.config.metricsInterval,
      slowQueryThreshold: this.config.slowQueryThreshold
    });
  }

  collectSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    
    // Update peak memory usage
    if (memoryUsage.heapUsed > this.metrics.performance.peakMemoryUsage) {
      this.metrics.performance.peakMemoryUsage = memoryUsage.heapUsed;
    }
    
    // Log memory warning if threshold exceeded
    if (memoryUsage.heapUsed > this.config.memoryWarningThreshold) {
      this.logger.warn('High memory usage detected', {
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        threshold: `${(this.config.memoryWarningThreshold / 1024 / 1024).toFixed(2)}MB`
      });
    }
    
    // Log periodic metrics summary
    this.logger.info('Performance metrics summary', {
      uptime: Date.now() - this.metrics.performance.startTime,
      totalRequests: this.metrics.performance.totalRequests,
      totalErrors: this.metrics.performance.totalErrors,
      averageResponseTime: `${this.metrics.performance.averageResponseTime.toFixed(2)}ms`,
      memoryUsage: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      activeOperations: this.activeOperations.size
    });
  }
}

module.exports = PerformanceMonitor; 