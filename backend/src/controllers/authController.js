const bcrypt = require('bcryptjs');
const { db } = require('../config/db');
const { signUserToken } = require('../config/jwt');

function toPublicUser(profile) {
  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    user_metadata: {
      full_name: profile.full_name,
      username: profile.username,
      avatar_url: profile.avatar_url
    }
  };
}

async function signup(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await db('users').where({ email: normalizedEmail }).first();
    if (existing) return res.status(409).json({ error: 'Email is already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const [{ count }] = await db('users').count('id');
    const isFirstUser = Number(count) === 0;

    const user = await db.transaction(async (trx) => {
      const [newUser] = await trx('users')
        .insert({ email: normalizedEmail, password_hash: passwordHash })
        .returning('*');
      const emailPrefix = normalizedEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const [profile] = await trx('profiles')
        .insert({
          id: newUser.id,
          email: normalizedEmail,
          username: emailPrefix || null,
          role: isFirstUser ? 'admin' : 'user'
        })
        .returning('*');
      return profile;
    });

    const token = signUserToken(user);
    res.status(201).json({ user: toPublicUser(user), access_token: token });
  } catch (err) {
    console.error('[Auth] signup error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const authUser = await db('users').where({ email: normalizedEmail }).first();
    if (!authUser) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, authUser.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const profileBefore = await db('profiles').where({ id: authUser.id }).first();
    if (profileBefore && profileBefore.is_active === false) {
      return res.status(403).json({ error: 'This account has been disabled' });
    }

    await db('users').where({ id: authUser.id }).update({ last_sign_in_at: db.fn.now() });
    const profile = await db('profiles').where({ id: authUser.id }).first();

    const token = signUserToken(profile);
    res.json({ user: toPublicUser(profile), access_token: token });
  } catch (err) {
    console.error('[Auth] login error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Stateless JWT - nothing to invalidate server-side, client just drops the token.
async function logout(_req, res) {
  res.json({ success: true });
}

async function me(req, res) {
  const profile = await db('profiles').where({ id: req.user.id }).first();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  res.json({ user: toPublicUser(profile) });
}

async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { full_name, username, avatar_url } = req.body;

    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    if (username !== undefined) {
      const normalized = String(username).trim().toLowerCase();
      if (normalized && !/^[a-z0-9_-]+$/.test(normalized)) {
        return res.status(400).json({ error: 'Username can only contain lowercase letters, numbers, underscores, or hyphens' });
      }
      updates.username = normalized || null;
    }
    updates.updated_at = db.fn.now();

    const [profile] = await db('profiles').where({ id: userId }).update(updates).returning('*');
    res.json({ user: toPublicUser(profile) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username is already taken, try another one' });
    console.error('[Auth] updateProfile error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function changePassword(req, res) {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const passwordHash = await bcrypt.hash(new_password, 10);
    await db('users').where({ id: req.user.id }).update({ password_hash: passwordHash, updated_at: db.fn.now() });
    res.json({ success: true });
  } catch (err) {
    console.error('[Auth] changePassword error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Look up a public profile by id or username - used for collaborator lookup,
// comment author display, and the public blog pages (replaces the frontend
// querying Svarabase's `profiles` table directly).
async function getProfileByUsername(req, res) {
  const { username } = req.params;
  const profile = await db('profiles').where({ username }).first();
  if (!profile) return res.status(404).json({ error: 'Not found' });
  res.json({ profile: { id: profile.id, username: profile.username, full_name: profile.full_name, avatar_url: profile.avatar_url } });
}

module.exports = { signup, login, logout, me, updateProfile, changePassword, getProfileByUsername };
