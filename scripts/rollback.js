const config = require('../config/config');
const knex = require('knex')({
  client: 'pg', // Assuming PostgreSQL
  connection: config.database,
  migrations: {
    tableName: 'knex_migrations',
    directory: '../migrations' // Relative to the scripts/ directory
  }
});

knex.migrate.rollback(null, true)
  .then(([batchNo, log]) => {
    if (log.length === 0) {
      console.log('Already at the base migration');
    } else {
      console.log(`Batch ${batchNo} rolled back: ${log.length} migrations`);
      console.log(log.join('\n'));
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed to roll back:', err);
    process.exit(1);
  });
