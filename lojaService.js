import { db } from './src/database/index.js';

export async function obterInfoLoja() {
  const resultado = await db('loja_info').first();
  return resultado;
}
