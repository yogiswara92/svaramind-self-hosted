// The original schema gave every `created_by`/attribution FK a plain
// `REFERENCES users(id)` with no ON DELETE behavior (Postgres defaults to
// NO ACTION/RESTRICT). That silently blocked the admin "Delete User" feature
// with a foreign key violation the moment a user had created anything -
// found when promoting a real account to admin after test data cleanup.
//
// Primary ownership columns (created_by on rows the user actually owns) get
// ON DELETE CASCADE, consistent with notes_workspaces.owner_id which already
// had it and with the "hard delete removes all their data" behavior chosen
// for adminUsersController.deleteUser. Secondary attribution columns
// (last_edited_by, invited_by, resolved_by - someone other than the owner
// touched this row) get ON DELETE SET NULL instead, since deleting user B
// should not delete user A's document just because B left a comment on it.

const CASCADE_FKS = [
  ['notes_folders', 'created_by'],
  ['notes_documents', 'created_by'],
  ['notes_tags', 'created_by'],
  ['notes_document_versions', 'created_by'],
  ['notes_comments', 'created_by'],
  ['notes_attachments', 'created_by'],
  ['notes_templates', 'created_by']
];

const SET_NULL_FKS = [
  ['notes_documents', 'last_edited_by'],
  ['notes_document_collaborators', 'invited_by'],
  ['notes_comments', 'resolved_by'],
  ['notes_workspace_members', 'invited_by']
];

exports.up = async function (knex) {
  for (const [table, column] of CASCADE_FKS) {
    await knex.raw(`
      ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_${column}_fkey;
      ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_fkey
        FOREIGN KEY (${column}) REFERENCES users(id) ON DELETE CASCADE;
    `);
  }
  for (const [table, column] of SET_NULL_FKS) {
    await knex.raw(`
      ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_${column}_fkey;
      ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_fkey
        FOREIGN KEY (${column}) REFERENCES users(id) ON DELETE SET NULL;
    `);
  }
};

exports.down = async function (knex) {
  for (const [table, column] of [...CASCADE_FKS, ...SET_NULL_FKS]) {
    await knex.raw(`
      ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_${column}_fkey;
      ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_fkey
        FOREIGN KEY (${column}) REFERENCES users(id);
    `);
  }
};
