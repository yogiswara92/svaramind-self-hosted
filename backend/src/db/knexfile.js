require('dotenv').config();

const base = {
  client: 'pg',
  connection: process.env.DATABASE_URL || {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'svaramind_local'
  },
  pool: { min: 2, max: 10 },
  migrations: {
    directory: __dirname + '/migrations',
    tableName: 'knex_migrations'
  }
};

module.exports = {
  development: base,
  production: base
};
