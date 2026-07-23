const { db } = require('../config/db');
const oauth = require('../services/mcpOAuthService');

const SCOPE = 'svaramind';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── Discovery metadata ───────────────────────────────────────────────────

function discoverAuthorizationServer(_req, res) {
  res.json({
    issuer: oauth.ISSUER,
    authorization_endpoint: `${oauth.ISSUER}/oauth/authorize`,
    token_endpoint: `${oauth.ISSUER}/oauth/token`,
    registration_endpoint: `${oauth.ISSUER}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: [SCOPE],
  });
}

function discoverProtectedResource(_req, res) {
  res.json({
    resource: `${oauth.ISSUER}/mcp`,
    authorization_servers: [oauth.ISSUER],
    scopes_supported: [SCOPE],
  });
}

// ── Dynamic Client Registration (RFC 7591) ──────────────────────────────

async function registerClient(req, res) {
  const { redirect_uris, client_name, token_endpoint_auth_method } = req.body || {};

  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' });
  }
  for (const uri of redirect_uris) {
    try {
      const u = new URL(uri);
      if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must use https (or localhost for dev clients)' });
      }
    } catch {
      return res.status(400).json({ error: 'invalid_redirect_uri', error_description: `not a valid URL: ${uri}` });
    }
  }

  const authMethod = token_endpoint_auth_method === 'client_secret_post' ? 'client_secret_post' : 'none';

  let client;
  try {
    [client] = await db('mcp_oauth_clients')
      .insert({
        client_name: client_name || 'Unnamed MCP client',
        redirect_uris: JSON.stringify(redirect_uris),
        token_endpoint_auth_method: authMethod,
        grant_types: JSON.stringify(['authorization_code', 'refresh_token']),
      })
      .returning(['client_id', 'client_name', 'redirect_uris', 'token_endpoint_auth_method', 'grant_types', 'created_at']);
  } catch (e) {
    console.error('[MCP OAuth] registerClient error:', e.message);
    return res.status(500).json({ error: 'server_error' });
  }

  return res.status(201).json({
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    grant_types: client.grant_types,
    response_types: ['code'],
    client_id_issued_at: Math.floor(new Date(client.created_at).getTime() / 1000),
  });
}

// ── Authorize (combined login + consent, single form submit) ───────────

async function loadClientOrNull(clientId) {
  if (!clientId) return null;
  const data = await db('mcp_oauth_clients').where({ client_id: clientId }).select('client_id', 'client_name', 'redirect_uris').first();
  if (!data) return null;
  return data;
}

function renderAuthorizePage({ client, params, error }) {
  const hidden = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'response_type', 'scope']
    .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(params[k] || '')}">`)
    .join('\n      ');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Connect to Svaramind</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #0f1115; color: #e6e6e6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #171a21; border: 1px solid #2a2e38; border-radius: 12px; padding: 32px; width: 100%; max-width: 380px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p.sub { color: #9aa1ac; font-size: 14px; margin: 0 0 24px; }
    label { display: block; font-size: 13px; margin: 14px 0 6px; color: #b8bec9; }
    input[type=email], input[type=password] { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #2a2e38; background: #0f1115; color: #e6e6e6; font-size: 14px; }
    button { width: 100%; margin-top: 20px; padding: 11px; border-radius: 8px; border: none; background: #6c63ff; color: white; font-size: 14px; font-weight: 600; cursor: pointer; }
    button:hover { background: #5a52e0; }
    .error { background: #3a1d22; border: 1px solid #6b2530; color: #ff9aa8; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
    .scope { background: #0f1115; border: 1px solid #2a2e38; border-radius: 8px; padding: 12px; font-size: 13px; color: #b8bec9; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(client.client_name)} wants to access your Svaramind</h1>
    <p class="sub">Sign in to allow read/write access to your notes workspaces.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <form method="POST" action="/oauth/authorize">
      ${hidden}
      <label>Email</label>
      <input type="email" name="email" required autofocus>
      <label>Password</label>
      <input type="password" name="password" required>
      <div class="scope">This will let ${escapeHtml(client.client_name)} search, read, and write notes in your Svaramind workspaces.</div>
      <button type="submit">Sign in &amp; Allow</button>
    </form>
  </div>
</body>
</html>`;
}

function validateAuthorizeParams(q) {
  const { client_id, redirect_uri, response_type, code_challenge, code_challenge_method } = q;
  if (!client_id) return 'client_id is required';
  if (!redirect_uri) return 'redirect_uri is required';
  if (response_type !== 'code') return 'response_type must be "code"';
  if (!code_challenge) return 'code_challenge is required (PKCE is mandatory)';
  if (code_challenge_method && code_challenge_method !== 'S256') return 'only code_challenge_method=S256 is supported';
  return null;
}

async function showAuthorize(req, res) {
  const validationError = validateAuthorizeParams(req.query);
  if (validationError) {
    return res.status(400).send(`<p>Invalid request: ${escapeHtml(validationError)}</p>`);
  }

  const client = await loadClientOrNull(req.query.client_id);
  if (!client) {
    return res.status(400).send('<p>Unknown client_id. This MCP client has not registered.</p>');
  }
  if (!client.redirect_uris.includes(req.query.redirect_uri)) {
    // Never redirect on a mismatched redirect_uri — that's the classic
    // open-redirect hole this check exists to close.
    return res.status(400).send('<p>redirect_uri does not match any URI registered for this client.</p>');
  }

  res.set('Content-Type', 'text/html').send(renderAuthorizePage({ client, params: req.query }));
}

async function handleAuthorizeSubmit(req, res) {
  const body = req.body || {};
  const validationError = validateAuthorizeParams(body);
  if (validationError) {
    return res.status(400).send(`<p>Invalid request: ${escapeHtml(validationError)}</p>`);
  }

  const client = await loadClientOrNull(body.client_id);
  if (!client || !client.redirect_uris.includes(body.redirect_uri)) {
    return res.status(400).send('<p>Invalid client or redirect_uri.</p>');
  }

  const rerender = (error) => res.status(401).set('Content-Type', 'text/html').send(renderAuthorizePage({ client, params: body, error }));

  const user = await oauth.verifyUserCredentials(body.email, body.password);
  if (!user) return rerender('Wrong email or password.');

  const code = oauth.generateAuthCode();
  try {
    await oauth.storeAuthCode({
      code,
      clientId: client.client_id,
      userId: user.userId,
      redirectUri: body.redirect_uri,
      codeChallenge: body.code_challenge,
      codeChallengeMethod: body.code_challenge_method || 'S256',
      scope: body.scope || SCOPE,
    });
  } catch (e) {
    console.error('[MCP OAuth] storeAuthCode error:', e.message);
    return res.status(500).send('<p>Server error while issuing the authorization code.</p>');
  }

  const redirect = new URL(body.redirect_uri);
  redirect.searchParams.set('code', code);
  if (body.state) redirect.searchParams.set('state', body.state);
  return res.redirect(302, redirect.toString());
}

// ── Token endpoint ───────────────────────────────────────────────────────

async function handleToken(req, res) {
  const { grant_type } = req.body || {};

  if (grant_type === 'authorization_code') {
    const { code, redirect_uri, code_verifier, client_id } = req.body || {};
    if (!code || !redirect_uri || !code_verifier) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const record = await oauth.consumeAuthCode(code);
    if (!record) return res.status(400).json({ error: 'invalid_grant' });
    if (client_id && record.client_id !== client_id) return res.status(400).json({ error: 'invalid_grant' });
    if (record.redirect_uri !== redirect_uri) return res.status(400).json({ error: 'invalid_grant' });
    if (!oauth.verifyPkce(code_verifier, record.code_challenge)) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
    }

    const accessToken = oauth.signAccessToken({ userId: record.user_id, clientId: record.client_id, scope: record.scope });
    const refreshToken = oauth.generateRefreshToken();
    try {
      await oauth.storeRefreshToken({ token: refreshToken, clientId: record.client_id, userId: record.user_id, scope: record.scope });
    } catch (e) {
      console.error('[MCP OAuth] storeRefreshToken error:', e.message);
      return res.status(500).json({ error: 'server_error' });
    }

    return res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: oauth.ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: record.scope,
    });
  }

  if (grant_type === 'refresh_token') {
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(400).json({ error: 'invalid_request' });

    const record = await oauth.consumeRefreshToken(refresh_token);
    if (!record) return res.status(400).json({ error: 'invalid_grant' });

    const accessToken = oauth.signAccessToken({ userId: record.userId, clientId: record.clientId, scope: record.scope });
    const newRefreshToken = oauth.generateRefreshToken();
    try {
      await oauth.storeRefreshToken({ token: newRefreshToken, clientId: record.clientId, userId: record.userId, scope: record.scope });
    } catch (e) {
      console.error('[MCP OAuth] storeRefreshToken (rotate) error:', e.message);
      return res.status(500).json({ error: 'server_error' });
    }

    return res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: oauth.ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: newRefreshToken,
      scope: record.scope,
    });
  }

  return res.status(400).json({ error: 'unsupported_grant_type' });
}

module.exports = {
  discoverAuthorizationServer,
  discoverProtectedResource,
  registerClient,
  showAuthorize,
  handleAuthorizeSubmit,
  handleToken,
};
