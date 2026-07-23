const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error('Missing JWT_SECRET in .env - generate one with `openssl rand -base64 64`');
}

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signUserToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, { expiresIn: EXPIRES_IN });
}

function verifyUserToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signUserToken, verifyUserToken };
