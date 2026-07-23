exports.up = async function (knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('email').notNullable().unique();
    t.text('password_hash').notNullable();
    t.timestamp('email_confirmed_at', { useTz: true });
    t.timestamp('last_sign_in_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('profiles', (t) => {
    t.uuid('id').primary().references('id').inTable('users').onDelete('CASCADE');
    t.text('email').notNullable().unique();
    t.text('username').unique();
    t.text('full_name');
    t.text('avatar_url');
    t.text('role').notNullable().defaultTo('user');
    t.text('subscription_tier').notNullable().defaultTo('free');
    t.jsonb('preferences').defaultTo(knex.raw(`'{"theme": "light", "language": "en"}'::jsonb`));
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    t.check("role IN ('user', 'admin')");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('profiles');
  await knex.schema.dropTableIfExists('users');
};
