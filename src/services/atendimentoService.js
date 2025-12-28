import { db } from '../database/index.js';

export async function getAtendimentoByClienteId(clienteId) {
  if (!clienteId) {
    return null;
  }

  const atendimento = await db('atendimentos').where({ cliente_id: clienteId }).first();
  return atendimento || null;
}

export async function getOrCreateAtendimento(clienteId) {
  if (!clienteId) {
    throw new Error('clienteId é obrigatório para atendimento.');
  }

  const existente = await getAtendimentoByClienteId(clienteId);
  if (existente) {
    return existente;
  }

  try {
    const ids = await db('atendimentos').insert({
      cliente_id: clienteId,
      estado: 'AGUARDANDO_FOTO',
      orcamento_id_atual: null,
    });

    const atendimentoId = Array.isArray(ids) ? ids[0] : ids;
    const atendimento = await db('atendimentos').where({ id: atendimentoId }).first();
    return atendimento || null;
  } catch (error) {
    const atendimento = await getAtendimentoByClienteId(clienteId);
    if (atendimento) {
      return atendimento;
    }

    throw error;
  }
}

export async function setEstado(clienteId, estado) {
  return db('atendimentos').where({ cliente_id: clienteId }).update({ estado });
}

export async function setOrcamentoAtual(clienteId, orcamentoId) {
  return db('atendimentos')
    .where({ cliente_id: clienteId })
    .update({ orcamento_id_atual: orcamentoId });
}

export async function setEstadoEOrcamento(clienteId, estado, orcamentoId) {
  return db('atendimentos')
    .where({ cliente_id: clienteId })
    .update({ estado, orcamento_id_atual: orcamentoId });
}
