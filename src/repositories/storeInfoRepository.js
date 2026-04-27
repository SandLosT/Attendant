import { db } from '../database/index.js';

export async function getStoreInfo() {
  return db('loja_info').orderBy('id', 'asc').first();
}
