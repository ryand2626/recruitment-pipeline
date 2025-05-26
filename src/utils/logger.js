/**
 * Logger utility for the Jobs Pipeline
 * Provides consistent logging across the application
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'jobs-pipeline' },
  transports: [
    // Write all logs with importance level 'error' or less to error.log
    new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
    // Write all logs with importance level 'info' or less to combined.log
    new winston.transports.File({ filename: path.join(logsDir, 'combined.log') }),
  ],
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Add timestamp to console
      winston.format.errors({ stack: true }), // Ensure stack traces are available for console
      winston.format.printf(info => {
        const { timestamp, level, message, service, stack, ...rest } = info;
        
        let log = `${timestamp} [${service || 'app'}] ${level}: ${message}`;
        
        // Collect remaining properties (context from child loggers or direct metadata)
        const contextForLog = {};
        for (const key in rest) {
          // Ensure property is own and not a symbol (Winston uses symbols for internal properties)
          if (Object.prototype.hasOwnProperty.call(rest, key) && typeof rest[key] !== 'symbol') {
            // Exclude 'splat' if it's directly on 'rest', though it's usually handled by winston.format.splat() earlier
            // and its results merged or used.
            // Also, winston.format.metadata() could gather all metadata under a 'metadata' key.
            // Here, we assume 'rest' contains what's left after known properties are destructured.
             if (key !== 'splat' && key !== Symbol.for('splat')?.toString()) { // Check against actual symbol description if possible
                contextForLog[key] = rest[key];
            }
          }
        }
        
        if (Object.keys(contextForLog).length > 0) {
          log += ` ${JSON.stringify(contextForLog)}`;
        }
        
        if (stack) {
          log += `\n${stack}`;
        }
        return log;
      })
    ),
  }));
}

module.exports = logger;
