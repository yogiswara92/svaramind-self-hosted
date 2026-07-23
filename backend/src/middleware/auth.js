const { verifyUserToken } = require('../config/jwt');
const { db } = require('../config/db');

// Verifies the JWT locally instead of calling back out to an auth server
// (the old middleware did `supabase.auth.getUser(token)`, a network round
// trip to Svarabase on every single request). req.user mirrors the shape
// controllers already expect: { id, email, user_metadata }.
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const payload = verifyUserToken(token);
    const profile = await db('profiles').where({ id: payload.sub }).first();
    if (!profile) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    if (profile.is_active === false) {
      return res.status(403).json({ error: 'This account has been disabled' });
    }

    req.user = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      user_metadata: {
        full_name: profile.full_name,
        username: profile.username,
        avatar_url: profile.avatar_url
      }
    };
    req.token = token;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticateToken };
