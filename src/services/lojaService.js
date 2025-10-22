import { db } from '../database/index.js';

export async function obterInfoLoja() {
  return db('loja_info').first();
}
