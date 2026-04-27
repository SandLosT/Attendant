import { db } from '../database/index.js';
import { QUOTE_STATUS } from '../domain/constants/attendance.js';

export async function createQuote(payload) {
  const ids = await db('orcamentos').insert({
    cliente_id: payload.customerId,
    imagem_id: payload.imageId ?? null,
    status: payload.status ?? QUOTE_STATUS.DRAFT,
    valor_estimado: payload.estimatedValue ?? null,
    detalhes: JSON.stringify(payload.details ?? {}),
    match_score: payload.matchScore ?? null,
    ref_image_id: payload.refImageId ?? null,
  });
  const id = Array.isArray(ids) ? ids[0] : ids;
  return db('orcamentos').where({ id }).first();
}

export async function updateQuote(quoteId, payload) {
  const finalPayload = { ...payload };
  if (payload.details !== undefined) {
    finalPayload.detalhes = JSON.stringify(payload.details ?? {});
    delete finalPayload.details;
  }
  await db('orcamentos').where({ id: quoteId }).update(finalPayload);
  return db('orcamentos').where({ id: quoteId }).first();
}

export async function findQuoteById(quoteId) {
  return db('orcamentos').where({ id: quoteId }).first();
}

export async function listQuotesByStatus(status) {
  return db('orcamentos as o')
    .select('o.*', 'c.telefone as cliente_telefone', 'c.nome as cliente_nome')
    .join('clientes as c', 'c.id', 'o.cliente_id')
    .where('o.status', status)
    .orderBy('o.id', 'desc');
}
