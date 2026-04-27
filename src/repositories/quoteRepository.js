import { db } from '../database/index.js';
import { QUOTE_STATUS } from '../domain/constants/attendance.js';

function normalizeQuote(row) {
  if (!row) return row;
  let detalhes = row.detalhes;
  if (typeof detalhes === 'string') {
    try {
      detalhes = JSON.parse(detalhes);
    } catch {
      detalhes = {};
    }
  }
  return { ...row, detalhes: detalhes ?? {} };
}

export async function createQuote(payload) {
  const ids = await db('orcamentos').insert({
    cliente_id: payload.customerId,
    imagem_id: payload.imageId ?? null,
    status: payload.status ?? QUOTE_STATUS.DRAFT,
    valor_estimado: payload.estimatedValue ?? null,
    detalhes: JSON.stringify(payload.details ?? {}),
    match_score: payload.matchScore ?? null,
    ref_image_id: payload.refImageId ?? null,
    data_preferida: payload.preferredDate ?? null,
    periodo_preferido: payload.preferredPeriod ?? null,
    slot_data: payload.slotDate ?? null,
    slot_periodo: payload.slotPeriod ?? null,
    data_agendada: payload.scheduledAt ?? null,
  });
  const id = Array.isArray(ids) ? ids[0] : ids;
  return normalizeQuote(await db('orcamentos').where({ id }).first());
}

export async function updateQuote(quoteId, payload) {
  const finalPayload = { ...payload };
  if (payload.details !== undefined) {
    finalPayload.detalhes = JSON.stringify(payload.details ?? {});
    delete finalPayload.details;
  }
  await db('orcamentos').where({ id: quoteId }).update(finalPayload);
  return normalizeQuote(await db('orcamentos').where({ id: quoteId }).first());
}

export async function findQuoteById(quoteId) {
  return normalizeQuote(await db('orcamentos').where({ id: quoteId }).first());
}

export async function listQuotesByStatus(status) {
  const rows = await db('orcamentos as o')
    .select('o.*', 'c.telefone as cliente_telefone', 'c.nome as cliente_nome')
    .join('clientes as c', 'c.id', 'o.cliente_id')
    .where('o.status', status)
    .orderBy('o.id', 'desc');
  return rows.map(normalizeQuote);
}

export async function findOpenQuoteByCustomerId(customerId) {
  const row = await db('orcamentos')
    .where({ cliente_id: customerId })
    .whereNotIn('status', [QUOTE_STATUS.CLOSED, QUOTE_STATUS.REJECTED])
    .orderBy('id', 'desc')
    .first();
  return normalizeQuote(row);
}
