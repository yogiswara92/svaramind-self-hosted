// Ported from notes-be/migrations/20260711_mcp_oauth.sql. user_id now has an
// explicit FK to the local users table since we own the whole database.

exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
      client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name VARCHAR(255),
      redirect_uris JSONB NOT NULL,
      token_endpoint_auth_method VARCHAR(50) NOT NULL DEFAULT 'none',
      client_secret_hash TEXT,
      grant_types JSONB NOT NULL DEFAULT '["authorization_code", "refresh_token"]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
      code TEXT PRIMARY KEY,
      client_id UUID NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      redirect_uri TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      code_challenge_method VARCHAR(10) NOT NULL DEFAULT 'S256',
      scope TEXT NOT NULL DEFAULT 'svaramind',
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS mcp_oauth_refresh_tokens (
      token_hash TEXT PRIMARY KEY,
      client_id UUID NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scope TEXT NOT NULL DEFAULT 'svaramind',
      revoked_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_expires ON mcp_oauth_codes(expires_at);
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_refresh_expires ON mcp_oauth_refresh_tokens(expires_at);
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS mcp_oauth_refresh_tokens;
    DROP TABLE IF EXISTS mcp_oauth_codes;
    DROP TABLE IF EXISTS mcp_oauth_clients;
  `);
};
