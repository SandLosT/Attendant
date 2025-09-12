import knex from 'knex';
import path from 'path';

export const db = knex({
  client: 'sqlite3',
  connection: {
    filename: path.resolve('src', 'database', 'db.sqlite')
  },
  useNullAsDefault: true
});
