/**
 * Migration to create email_consent table for tracking email consent
 */

exports.up = async function(knex) {
  await knex.schema.createTable('email_consent', (table) => {
    table.string('email').primary().notNullable();
    table.boolean('has_consent').notNullable().defaultTo(false);
    table.string('source').notNullable().defaultTo('import'); // signup, import, api, etc.
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').nullable();
    
    // Index for faster lookups
    table.index(['email', 'expires_at']);
  });

  await knex.schema.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.schema.raw(`
    CREATE TRIGGER update_email_consent_updated_at
    BEFORE UPDATE ON email_consent
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async function(knex) {
  await knex.schema.raw('DROP TRIGGER IF EXISTS update_email_consent_updated_at ON email_consent');
  await knex.schema.raw('DROP FUNCTION IF EXISTS update_updated_at_column');
  await knex.schema.dropTable('email_consent');
};
