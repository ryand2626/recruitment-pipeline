const config = require('../config/config');
const knex = require('knex')({
  client: 'pg', // Assuming PostgreSQL
  connection: config.database,
  migrations: {
    tableName: 'knex_migrations',
    directory: '../migrations' // Relative to the scripts/ directory
  }
});

knex.migrate.latest()
  .then(([batchNo, log]) => {
    if (log.length === 0) {
      console.log('Already up to date');
    } else {
      console.log(`Batch ${batchNo} run: ${log.length} migrations`);
      console.log(log.join('\n'));
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed to migrate:', err);
    process.exit(1);
  });
