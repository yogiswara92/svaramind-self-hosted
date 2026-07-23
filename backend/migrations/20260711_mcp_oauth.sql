-- OAuth 2.1 authorization server tables for the Svaramind MCP endpoint.
-- Lets remote MCP clients (Claude.ai, ChatGPT connectors) register themselves
-- (RFC 7591 dynamic client registration), run an authorization_code + PKCE
-- flow against the user's existing Svarabase login, and receive short-lived
-- access tokens + rotating refresh tokens scoped to that one user.

-- redirect_uris / grant_types are JSONB, not native Postgres arrays: the
-- self-hosted Svarabase REST layer doesn't translate a JSON array body into
-- a Postgres array literal (fails with "malformed array literal"), so we
-- store them as JSON arrays instead — round-trips through the REST API fine.
CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name VARCHAR(255),
  redirect_uris JSONB NOT NULL,
  token_endpoint_auth_method VARCHAR(50) NOT NULL DEFAULT 'none', -- 'none' (public+PKCE) or 'client_secret_post'
  client_secret_hash TEXT, -- only set when token_endpoint_auth_method = 'client_secret_post'
  grant_types JSONB NOT NULL DEFAULT '["authorization_code", "refresh_token"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
  code TEXT PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method VARCHAR(10) NOT NULL DEFAULT 'S256',
  scope TEXT NOT NULL DEFAULT 'svaramind',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_oauth_refresh_tokens (
  token_hash TEXT PRIMARY KEY, -- sha256 hex of the opaque refresh token; raw value never stored
  client_id UUID NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  scope TEXT NOT NULL DEFAULT 'svaramind',
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_expires ON mcp_oauth_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_refresh_expires ON mcp_oauth_refresh_tokens(expires_at);
