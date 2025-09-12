import path from 'path';

export default {
  development: {
    client: 'sqlite3',
    connection: {
      filename: path.resolve('src/database/db.sqlite')  // ← isso deve estar correto
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve('src/database/migrations'),
    },
    seeds: {
      directory: path.resolve('src/database/seeds'),
    },
  }
};
