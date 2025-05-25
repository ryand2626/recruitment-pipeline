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
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

module.exports = logger;
