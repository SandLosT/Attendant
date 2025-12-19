import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const {
  DB_CLIENT = 'mysql2',
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = '',
  DB_PASSWORD = '',
  DB_NAME = '',
} = process.env;

export default {
  development: {
    client: DB_CLIENT,
    connection: {
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
    },
    migrations: {
      directory: path.resolve('src/database/migrations'),
    },
    seeds: {
      directory: path.resolve('src/database/seeds'),
    },
  }
};
