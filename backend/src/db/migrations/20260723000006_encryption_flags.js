// encryptionService.encryptDocument() stamps `is_encrypted: true` onto
// documents and chunks when NOTES_ENCRYPTION_KEY is configured - these
// columns existed on the original Svarabase-hosted schema (added out-of-band,
// not captured in migration.sql/chunks_migration.sql) but were missed when
// porting the base schema in 20260723000002/3. Adding them here instead of
// editing already-applied migrations.

exports.up = async function (knex) {
  await knex.schema.alterTable('notes_documents', (t) => {
    t.boolean('is_encrypted').defaultTo(false);
    t.text('excerpt');
    t.text('diagram_xml');
    t.text('diagram_svg');
    t.timestamp('published_at', { useTz: true });
  });
  await knex.schema.alterTable('notes_document_versions', (t) => {
    t.boolean('is_encrypted').defaultTo(false);
  });
  await knex.schema.alterTable('notes_document_chunks', (t) => {
    t.boolean('is_encrypted').defaultTo(false);
  });
  // Rest of the per-user AI/embedding/transcription/blog settings the
  // frontend (stores/settings.ts) reads and writes - same story, added
  // out-of-band on the original hosted schema.
  await knex.schema.alterTable('notes_settings', (t) => {
    t.text('embedding_api_key');
    t.text('embedding_model');
    t.text('embedding_base_url');
    t.text('transcription_model');
    t.text('transcription_language');
    t.text('transcription_api_key');
    t.text('transcription_base_url');
    t.boolean('diarization_enabled').defaultTo(false);
    t.text('diarization_model');
    t.text('google_search_api_key');
    t.text('google_search_cx');
    t.text('blog_bio');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('notes_settings', (t) => {
    t.dropColumn('embedding_api_key');
    t.dropColumn('embedding_model');
    t.dropColumn('embedding_base_url');
    t.dropColumn('transcription_model');
    t.dropColumn('transcription_language');
    t.dropColumn('transcription_api_key');
    t.dropColumn('transcription_base_url');
    t.dropColumn('diarization_enabled');
    t.dropColumn('diarization_model');
    t.dropColumn('google_search_api_key');
    t.dropColumn('google_search_cx');
    t.dropColumn('blog_bio');
  });
  await knex.schema.alterTable('notes_document_chunks', (t) => {
    t.dropColumn('is_encrypted');
  });
  await knex.schema.alterTable('notes_document_versions', (t) => {
    t.dropColumn('is_encrypted');
  });
  await knex.schema.alterTable('notes_documents', (t) => {
    t.dropColumn('is_encrypted');
    t.dropColumn('excerpt');
    t.dropColumn('diagram_xml');
    t.dropColumn('diagram_svg');
    t.dropColumn('published_at');
  });
};
