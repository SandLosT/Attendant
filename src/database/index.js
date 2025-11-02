import knex from 'knex';
import * as dotenv from 'dotenv';

dotenv.config();

const {
  DB_CLIENT = 'mysql2',
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '130178',
  DB_NAME = 'sistema_orcamentos',
} = process.env;

export const db = knex({
  client: DB_CLIENT,
  connection: {
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  },
  pool: {
    min: 0,
    max: 10,
  },
});
