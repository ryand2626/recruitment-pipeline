exports.up = async function(knex) {
  // Create cache table
  await knex.schema.createTable('cache', function(table) {
    table.string('key', 255).primary();
    table.text('value').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('expires_at');
    table.index('key'); // Knex creates an index for primary keys by default, but explicit for clarity
  });

  // Add comments for documentation
  await knex.raw("COMMENT ON TABLE cache IS 'Application cache for storing API responses and computed data';");
  await knex.raw("COMMENT ON COLUMN cache.key IS 'Unique cache key identifier';");
  await knex.raw("COMMENT ON COLUMN cache.value IS 'JSON-serialized cached value';");
  await knex.raw("COMMENT ON COLUMN cache.expires_at IS 'Expiration timestamp for automatic cleanup';");
  await knex.raw("COMMENT ON COLUMN cache.created_at IS 'Cache entry creation timestamp';");
  await knex.raw("COMMENT ON COLUMN cache.updated_at IS 'Cache entry last update timestamp';");

  // Create function to automatically update updated_at timestamp
  await knex.schema.raw(`
    CREATE OR REPLACE FUNCTION update_cache_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger to automatically update updated_at
  await knex.schema.raw(`
    CREATE TRIGGER trigger_cache_updated_at
    BEFORE UPDATE ON cache
    FOR EACH ROW
    EXECUTE FUNCTION update_cache_updated_at();
  `);
};

exports.down = async function(knex) {
  // Drop trigger
  await knex.schema.raw('DROP TRIGGER IF EXISTS trigger_cache_updated_at ON cache;');

  // Drop function
  await knex.schema.raw('DROP FUNCTION IF EXISTS update_cache_updated_at();');

  // Drop table
  await knex.schema.dropTableIfExists('cache');
};
