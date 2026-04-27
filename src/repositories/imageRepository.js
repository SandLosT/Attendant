import { db } from '../database/index.js';

export async function saveImage({ customerId, path, originalName }) {
  const ids = await db('imagens').insert({
    cliente_id: customerId,
    caminho: path,
    nome_original: originalName,
  });
  return Array.isArray(ids) ? ids[0] : ids;
}
