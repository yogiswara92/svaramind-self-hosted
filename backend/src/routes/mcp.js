const express = require('express');
const mcpController = require('../controllers/mcpController');
const { verifyAccessToken } = require('../services/mcpOAuthService');

const router = express.Router();

// Two trusted callers can reach this endpoint:
//  1. Internal backend-to-backend (Hermes, the workflow engine): shared
//     x-svaramind-internal-key + a caller-supplied x-svaramind-user-id.
//  2. External OAuth 2.1 clients (Claude.ai, ChatGPT connectors): a Bearer
//     access token minted by /oauth/token, whose signed `sub` claim IS the
//     user id — never taken from a client-controlled header for this path.
function requireMcpAuth(req, res, next) {
  const internalKey = req.headers['x-svaramind-internal-key'];
  const expectedInternalKey = process.env.SVARAMIND_INTERNAL_KEY;
  if (internalKey && expectedInternalKey && internalKey === expectedInternalKey) {
    const userId = req.headers['x-svaramind-user-id'];
    if (!userId) {
      return res.status(400).json({ error: 'x-svaramind-user-id header required' });
    }
    req.mcpUserId = userId;
    req.mcpAuthMode = 'internal';
    return next();
  }

  const authHeader = req.headers['authorization'] || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const payload = verifyAccessToken(bearerMatch[1]);
    if (!payload) {
      res.set('WWW-Authenticate', `Bearer error="invalid_token", resource="${process.env.MCP_OAUTH_ISSUER || ''}/mcp"`);
      return res.status(401).json({ error: 'invalid_token' });
    }
    req.mcpUserId = payload.sub;
    req.mcpAuthMode = 'oauth';
    req.mcpClientId = payload.client_id;
    return next();
  }

  res.set('WWW-Authenticate', `Bearer resource_metadata="${process.env.MCP_OAUTH_ISSUER || ''}/.well-known/oauth-protected-resource"`);
  return res.status(401).json({ error: 'unauthorized' });
}

// MCP JSON-RPC 2.0 endpoint
router.post('/', requireMcpAuth, mcpController.handleJsonRpc);

// Session termination (Streamable HTTP transport). We're fully stateless —
// nothing to tear down server-side — but strict clients call this on
// disconnect and expect a clean response rather than a 404.
router.delete('/', requireMcpAuth, (_req, res) => res.status(204).end());

// We don't support the optional server-initiated SSE stream — per the
// Streamable HTTP transport spec, declining GET with 405 is valid and tells
// the client to stick to request/response POSTs only.
router.get('/', requireMcpAuth, (_req, res) => res.status(405).json({ error: 'method_not_allowed' }));

module.exports = router;
