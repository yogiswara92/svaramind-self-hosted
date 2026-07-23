// Usage: node src/scripts/createAdmin.js <email> <password>
// Creates a new user directly with role=admin, or promotes an existing user
// to admin if the email already exists. Useful for bootstrapping the first
// admin without relying on "first signup wins" (e.g. re-provisioning).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db } = require('../config/db');

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: node src/scripts/createAdmin.js <email> [password]');
    process.exit(1);
  }
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db('users').where({ email: normalizedEmail }).first();
  if (existing) {
    await db('profiles').where({ id: existing.id }).update({ role: 'admin', updated_at: db.fn.now() });
    console.log(`Promoted existing user ${normalizedEmail} to admin.`);
  } else {
    if (!password) {
      console.error('Password is required when creating a new user.');
      process.exit(1);
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await db.transaction(async (trx) => {
      const [user] = await trx('users').insert({ email: normalizedEmail, password_hash: passwordHash }).returning('*');
      const emailPrefix = normalizedEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');
      await trx('profiles').insert({ id: user.id, email: normalizedEmail, username: emailPrefix || null, role: 'admin' });
    });
    console.log(`Created new admin user ${normalizedEmail}.`);
  }

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
