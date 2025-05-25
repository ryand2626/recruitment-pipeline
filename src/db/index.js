/**
 * Database utility for the Jobs Pipeline
 * Handles connections and queries to the PostgreSQL database
 */

const { Pool } = require('pg');
const config = require('../../config/config');
const logger = require('../utils/logger');

// Create a new pool using the configuration
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
});

// The pool will emit an error on behalf of any idle clients
// if a backend error or network partition happens
pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Execute a query with parameters
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    logger.error('Error executing query', { text, error: err.message });
    throw err;
  }
}

/**
 * Insert a new job into the database
 * @param {Object} job - Job data
 * @returns {Promise<Object>} Inserted job
 */
async function insertJob(job) {
  const {
    title,
    company,
    location,
    description,
    salary_range,
    job_url,
    contact_email,
    contact_name,
    company_domain,
    raw_json,
    source
  } = job;

  const text = `
    INSERT INTO jobs(
      title, company, location, description, salary_range, job_url,
      contact_email, contact_name, company_domain, raw_json, source
    )
    VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;

  const values = [
    title,
    company,
    location,
    description,
    salary_range,
    job_url,
    contact_email,
    contact_name,
    company_domain,
    raw_json,
    source
  ];

  try {
    const res = await query(text, values);
    return res.rows[0];
  } catch (err) {
    logger.error('Error inserting job', { job, error: err.message });
    throw err;
  }
}

/**
 * Check if a job already exists in the database by URL
 * @param {string} jobUrl - URL of the job posting
 * @returns {Promise<boolean>} True if job exists, false otherwise
 */
async function jobExists(jobUrl) {
  const text = 'SELECT id FROM jobs WHERE job_url = $1 LIMIT 1';
  const values = [jobUrl];

  try {
    const res = await query(text, values);
    return res.rows.length > 0;
  } catch (err) {
    logger.error('Error checking if job exists', { jobUrl, error: err.message });
    throw err;
  }
}

/**
 * Get all jobs matching a specific title
 * @param {string} title - Job title to search for
 * @returns {Promise<Array>} Array of jobs
 */
async function getJobsByTitle(title) {
  const text = 'SELECT * FROM jobs WHERE title ILIKE $1';
  const values = [`%${title}%`];

  try {
    const res = await query(text, values);
    return res.rows;
  } catch (err) {
    logger.error('Error getting jobs by title', { title, error: err.message });
    throw err;
  }
}

module.exports = {
  query,
  insertJob,
  jobExists,
  getJobsByTitle,
  pool
};
