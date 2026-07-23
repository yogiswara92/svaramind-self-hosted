const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('../config/db');

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;        // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const AUTH_CODE_TTL_SECONDS = 10 * 60;           // 10 minutes
const ISSUER = process.env.MCP_OAUTH_ISSUER || 'http://localhost:3002';

function getJwtSecret() {
  const secret = process.env.MCP_OAUTH_JWT_SECRET;
  if (!secret) throw new Error('MCP_OAUTH_JWT_SECRET not configured');
  return secret;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// ── PKCE ─────────────────────────────────────────────────────────────────

// RFC 7636: code_challenge = BASE64URL(SHA256(code_verifier))
function verifyPkce(codeVerifier, codeChallenge) {
  if (!codeVerifier || !codeChallenge) return false;
  const computed = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(codeChallenge));
}

// ── Access tokens (stateless JWT, HS256) ────────────────────────────────

function signAccessToken({ userId, clientId, scope }) {
  return jwt.sign(
    { sub: userId, client_id: clientId, scope: scope || 'svaramind', token_use: 'access' },
    getJwtSecret(),
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS, issuer: ISSUER }
  );
}

function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret(), { issuer: ISSUER });
    if (payload.token_use !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Refresh tokens (opaque random string; only the sha256 hash is stored) ──

function generateRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function storeRefreshToken({ token, clientId, userId, scope }) {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
  await db('mcp_oauth_refresh_tokens').insert({
    token_hash: sha256Hex(token),
    client_id: clientId,
    user_id: userId,
    scope: scope || 'svaramind',
    expires_at: expiresAt,
  });
}

async function consumeRefreshToken(token) {
  const tokenHash = sha256Hex(token);
  const data = await db('mcp_oauth_refresh_tokens')
    .where({ token_hash: tokenHash })
    .select('token_hash', 'client_id', 'user_id', 'scope', 'revoked_at', 'expires_at')
    .first();
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  // Rotate: revoke the used token so it can't be replayed.
  await db('mcp_oauth_refresh_tokens').where({ token_hash: tokenHash }).update({ revoked_at: db.fn.now() });

  return { clientId: data.client_id, userId: data.user_id, scope: data.scope };
}

// ── Authorization codes ─────────────────────────────────────────────────

function generateAuthCode() {
  return crypto.randomBytes(32).toString('base64url');
}

async function storeAuthCode({ code, clientId, userId, redirectUri, codeChallenge, codeChallengeMethod, scope }) {
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString();
  await db('mcp_oauth_codes').insert({
    code,
    client_id: clientId,
    user_id: userId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod || 'S256',
    scope: scope || 'svaramind',
    expires_at: expiresAt,
  });
}

// Single-use: fetches the code and marks it used in the same call. Returns
// null if the code doesn't exist, is expired, or was already used — callers
// must treat all of those as "invalid_grant" without distinguishing why
// (RFC 6749 §5.2), so a replayed code can't be used to fingerprint state.
async function consumeAuthCode(code) {
  const data = await db('mcp_oauth_codes').where({ code }).first();
  if (!data) return null;
  if (data.used_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  await db('mcp_oauth_codes').where({ code }).update({ used_at: db.fn.now() });

  return data;
}

// ── Login (verify user credentials against the local users table) ───────

async function verifyUserCredentials(email, password) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await db('users').where({ email: normalizedEmail }).first();
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;
  return { userId: user.id, email: user.email };
}

module.exports = {
  ISSUER,
  ACCESS_TOKEN_TTL_SECONDS,
  verifyPkce,
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  consumeRefreshToken,
  generateAuthCode,
  storeAuthCode,
  consumeAuthCode,
  verifyUserCredentials,
};
