require('dotenv').config();
const express = require('express');
const cors = require('cors');
const notesRoutes = require('./routes/notes');
const mcpRoutes = require('./routes/mcp');
const oauthRoutes = require('./routes/oauth');
const authRoutes = require('./routes/auth');
const storageRoutes = require('./routes/storage');
const adminRoutes = require('./routes/admin');
const oauthController = require('./controllers/oauthController');

const app = express();
const PORT = process.env.PORT || 3002;

// ── CORS ──────────────────────────────────────────────────────────────────────
// No hardcoded yesvara.com domains here on purpose - this is a standalone,
// closed-loop deployment, so allowed origins come only from local defaults
// and CORS_ORIGIN in .env.
const allowedOrigins = [
    'http://localhost:5175',
    'http://localhost:5173',
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : [])
].filter(Boolean);

app.use(cors({
    origin(origin, cb) {
        if (!origin) return cb(null, true);
        const o = origin.replace(/\/$/, '');
        if (allowedOrigins.includes(o)) {
            return cb(null, true);
        }
        console.warn('🚫 CORS blocked:', origin);
        return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options(/.*/, cors());

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ extended: true, limit: '1gb' }));

app.use((req, _res, next) => {
    console.log(`[Notes BE] ${req.method} ${req.originalUrl}`);
    next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'svaramind-local-be', ts: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notes', notesRoutes);
app.use('/mcp', mcpRoutes);

// OAuth 2.1 authorization server for MCP remote clients (Claude.ai, ChatGPT
// connectors). Discovery metadata lives at the well-known root paths per
// RFC 8414 / the MCP authorization spec; everything else is under /oauth.
app.get('/.well-known/oauth-authorization-server', oauthController.discoverAuthorizationServer);
app.get('/.well-known/oauth-protected-resource', oauthController.discoverProtectedResource);
app.use('/oauth', oauthRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error('[Notes BE] Unhandled error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`\n🗒️  Svaramind Local BE running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API:    http://localhost:${PORT}/api/notes\n`);
});
