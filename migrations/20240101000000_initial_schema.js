exports.up = async function(knex) {
  // Create extension for UUID support
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  // Create jobs table
  await knex.schema.createTable('jobs', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('title', 255).notNullable();
    table.string('company', 255);
    table.string('location', 255);
    table.text('description');
    table.string('salary_range', 255);
    table.text('job_url');
    table.string('contact_email', 255);
    table.string('contact_name', 255);
    table.string('company_domain', 255);
    table.jsonb('raw_json');
    table.string('source', 50).notNullable();
    table.string('status', 50).defaultTo('new');
    table.timestamp('collected_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('title');
    table.index('collected_at');
    table.index('company');
  });

  // Create email_events table
  await knex.schema.createTable('email_events', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('job_id').references('id').inTable('jobs');
    table.string('event_type', 50).notNullable();
    table.string('email', 255).notNullable();
    table.jsonb('data');
    table.timestamp('collected_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('job_id');
    table.index('event_type');
  });

  // Create unsubscribe_list table
  await knex.schema.createTable('unsubscribe_list', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('email', 255).notNullable().unique();
    table.text('reason');
    table.timestamp('collected_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('email');
  });

  // Create domains_cache table
  await knex.schema.createTable('domains_cache', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('domain', 255).notNullable().unique();
    table.string('email_pattern', 255);
    table.jsonb('contacts');
    table.timestamp('last_updated', { useTz: true }).defaultTo(knex.fn.now());

    table.index('domain');
  });

  // Function to update updated_at timestamp
  await knex.schema.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Trigger to automatically update updated_at on jobs table
  await knex.schema.raw(`
    CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async function(knex) {
  // Drop trigger on jobs table
  await knex.schema.raw('DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;');

  // Drop function
  await knex.schema.raw('DROP FUNCTION IF EXISTS update_updated_at_column();');

  // Drop tables in reverse order of creation
  await knex.schema.dropTableIfExists('domains_cache');
  await knex.schema.dropTableIfExists('unsubscribe_list');
  await knex.schema.dropTableIfExists('email_events');
  await knex.schema.dropTableIfExists('jobs');

  // Optionally, drop the extension (use with caution)
  // await knex.raw('DROP EXTENSION IF EXISTS "uuid-ossp";');
};
