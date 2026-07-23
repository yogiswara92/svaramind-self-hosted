const bcrypt = require('bcryptjs');
const { db } = require('../config/db');

async function listUsers(_req, res) {
  try {
    const users = await db('profiles as p')
      .join('users as u', 'u.id', 'p.id')
      .select(
        'p.id', 'p.email', 'p.username', 'p.full_name', 'p.role', 'p.is_active',
        'u.created_at', 'u.last_sign_in_at'
      )
      .orderBy('u.created_at', 'asc');
    res.json({ users });
  } catch (err) {
    console.error('[AdminUsers] listUsers error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function createUser(req, res) {
  try {
    const { email, password, role, full_name, username } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (role && !['user', 'admin'].includes(role)) return res.status(400).json({ error: 'role must be "user" or "admin"' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await db('users').where({ email: normalizedEmail }).first();
    if (existing) return res.status(409).json({ error: 'Email is already registered' });

    const normalizedUsername = username ? String(username).trim().toLowerCase() : null;
    if (normalizedUsername && !/^[a-z0-9_-]+$/.test(normalizedUsername)) {
      return res.status(400).json({ error: 'Username can only contain lowercase letters, numbers, underscores, or hyphens' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const profile = await db.transaction(async (trx) => {
      const [newUser] = await trx('users').insert({ email: normalizedEmail, password_hash: passwordHash }).returning('*');
      const emailPrefix = normalizedEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const [p] = await trx('profiles')
        .insert({
          id: newUser.id,
          email: normalizedEmail,
          username: normalizedUsername || emailPrefix || null,
          full_name: full_name || null,
          role: role || 'user'
        })
        .returning('*');
      return p;
    });

    res.status(201).json({ user: profile });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username is already taken' });
    console.error('[AdminUsers] createUser error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { role, full_name, username, is_active, new_password } = req.body;

    if (id === req.user.id && (role === 'user' || is_active === false)) {
      return res.status(400).json({ error: "You can't demote or disable your own account" });
    }
    if (role && !['user', 'admin'].includes(role)) return res.status(400).json({ error: 'role must be "user" or "admin"' });

    if (role === 'user') {
      const admin = await db('profiles').where({ id }).first();
      if (admin?.role === 'admin') {
        const [{ count }] = await db('profiles').where({ role: 'admin' }).count('id');
        if (Number(count) <= 1) return res.status(400).json({ error: 'Cannot remove the last remaining admin' });
      }
    }

    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = !!is_active;
    if (username !== undefined) {
      const normalized = String(username).trim().toLowerCase();
      if (normalized && !/^[a-z0-9_-]+$/.test(normalized)) {
        return res.status(400).json({ error: 'Username can only contain lowercase letters, numbers, underscores, or hyphens' });
      }
      updates.username = normalized || null;
    }
    updates.updated_at = db.fn.now();

    const [profile] = await db('profiles').where({ id }).update(updates).returning('*');
    if (!profile) return res.status(404).json({ error: 'User not found' });

    if (new_password) {
      if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const passwordHash = await bcrypt.hash(new_password, 10);
      await db('users').where({ id }).update({ password_hash: passwordHash, updated_at: db.fn.now() });
    }

    res.json({ user: profile });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username is already taken' });
    console.error('[AdminUsers] updateUser error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: "You can't delete your own account" });

    const target = await db('profiles').where({ id }).first();
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.role === 'admin') {
      const [{ count }] = await db('profiles').where({ role: 'admin' }).count('id');
      if (Number(count) <= 1) return res.status(400).json({ error: 'Cannot delete the last remaining admin' });
    }

    // users -> profiles/workspaces/etc. all cascade via ON DELETE CASCADE.
    await db('users').where({ id }).delete();
    res.json({ success: true });
  } catch (err) {
    console.error('[AdminUsers] deleteUser error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
