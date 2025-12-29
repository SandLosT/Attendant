import { db } from '../database/index.js';

function normalizarStatusFaz(valor) {
  return (
    valor === true ||
    valor === 1 ||
    valor === 'true' ||
    valor === '1' ||
    valor === 'faz'
  );
}

function resolverRefImageId(estimate) {
  const candidates = [
    estimate?.ref_image_id,
    estimate?.best_match_id,
    estimate?.best_match_ref_id,
    estimate?.best_match_image_id,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) {
      continue;
    }

    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return null;
}

export async function criarOrcamentoParaImagem({ clienteId, imagemId, estimate }) {
  if (!clienteId) {
    throw new Error('clienteId é obrigatório para criar orçamento.');
  }

  const thresholdPassed = estimate?.threshold_passed === true;
  const statusFaz = normalizarStatusFaz(estimate?.best_match_status_faz);
  const valorEstimado =
    thresholdPassed && statusFaz
      ? estimate?.suggested_value || estimate?.best_match_valor_ref
      : null;

  const payload = {
    cliente_id: clienteId,
    imagem_id: imagemId ?? null,
    valor_estimado: valorEstimado,
    status: 'PENDENTE',
    detalhes: JSON.stringify(estimate ?? {}),
    match_score: estimate?.best_match_score ?? null,
    ref_image_id: resolverRefImageId(estimate),
  };

  const ids = await db('orcamentos').insert(payload);
  const orcamentoId = Array.isArray(ids) ? ids[0] : ids;
  return orcamentoId;
}

export async function setPreferenciaData(orcamentoId, { data_preferida, periodo_preferido }) {
  return db('orcamentos')
    .where({ id: orcamentoId })
    .update({
      data_preferida,
      periodo_preferido,
      slot_data: data_preferida,
      slot_periodo: periodo_preferido,
      slot_reservado_em: db.fn.now(),
    });
}

export async function limparSlotPreReservado(orcamentoId) {
  return db('orcamentos').where({ id: orcamentoId }).update({
    slot_data: null,
    slot_periodo: null,
    slot_reservado_em: null,
  });
}

export async function setStatus(orcamentoId, status, extras = {}) {
  return db('orcamentos')
    .where({ id: orcamentoId })
    .update({ status, ...extras });
}
