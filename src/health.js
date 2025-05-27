/**
 * Health check module for monitoring application status
 */

const container = require('./container');

class HealthCheck {
  constructor() {
    this.checks = new Map();
    this.registerDefaultChecks();
  }

  registerDefaultChecks() {
    // Database health check
    this.checks.set('database', async () => {
      try {
        const db = container.resolve('db');
        await db.query('SELECT 1');
        return { status: 'healthy', message: 'Database connection successful' };
      } catch (error) {
        return { status: 'unhealthy', message: `Database error: ${error.message}` };
      }
    });

    // API keys validation
    this.checks.set('api_keys', async () => {
      try {
        const config = container.resolve('config');
        const missingKeys = [];
        
        if (!config.apiKeys.serpApi) missingKeys.push('SerpAPI');
        if (!config.apiKeys.hunter) missingKeys.push('Hunter.io');
        if (!config.apiKeys.sendGrid) missingKeys.push('SendGrid');
        
        if (missingKeys.length > 0) {
          return { 
            status: 'warning', 
            message: `Missing API keys: ${missingKeys.join(', ')}` 
          };
        }
        
        return { status: 'healthy', message: 'All required API keys configured' };
      } catch (error) {
        return { status: 'unhealthy', message: `Config error: ${error.message}` };
      }
    });

    // Email configuration check
    this.checks.set('email_config', async () => {
      try {
        const config = container.resolve('config');
        
        if (!config.email.fromEmail || !config.email.fromName) {
          return { 
            status: 'warning', 
            message: 'Email configuration incomplete' 
          };
        }
        
        return { status: 'healthy', message: 'Email configuration valid' };
      } catch (error) {
        return { status: 'unhealthy', message: `Email config error: ${error.message}` };
      }
    });

    // Memory usage check
    this.checks.set('memory', async () => {
      try {
        const usage = process.memoryUsage();
        const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
        const totalMB = Math.round(usage.heapTotal / 1024 / 1024);
        
        if (usedMB > 500) { // Warning if using more than 500MB
          return { 
            status: 'warning', 
            message: `High memory usage: ${usedMB}MB / ${totalMB}MB` 
          };
        }
        
        return { 
          status: 'healthy', 
          message: `Memory usage: ${usedMB}MB / ${totalMB}MB` 
        };
      } catch (error) {
        return { status: 'unhealthy', message: `Memory check error: ${error.message}` };
      }
    });
  }

  async runCheck(name) {
    const check = this.checks.get(name);
    if (!check) {
      return { status: 'unknown', message: `Check '${name}' not found` };
    }

    try {
      return await check();
    } catch (error) {
      return { status: 'error', message: `Check failed: ${error.message}` };
    }
  }

  async runAllChecks() {
    const results = {};
    let overallStatus = 'healthy';

    for (const [name, check] of this.checks) {
      try {
        const result = await check();
        results[name] = result;

        // Determine overall status
        if (result.status === 'unhealthy' || result.status === 'error') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'warning' && overallStatus === 'healthy') {
          overallStatus = 'warning';
        }
      } catch (error) {
        results[name] = { 
          status: 'error', 
          message: `Check failed: ${error.message}` 
        };
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: results,
      uptime: process.uptime(),
      version: require('../package.json').version
    };
  }

  registerCheck(name, checkFunction) {
    this.checks.set(name, checkFunction);
  }

  removeCheck(name) {
    return this.checks.delete(name);
  }

  getCheckNames() {
    return Array.from(this.checks.keys());
  }
}

module.exports = new HealthCheck(); 