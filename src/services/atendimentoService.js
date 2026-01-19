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
    if (!existente.estado) {
      await db('atendimentos')
        .where({ cliente_id: clienteId })
        .update({ estado: 'AGUARDANDO_FOTO' });
      return getAtendimentoByClienteId(clienteId);
    }

    return existente;
  }

  try {
    const ids = await db('atendimentos').insert({
      cliente_id: clienteId,
      estado: 'AGUARDANDO_FOTO',
      modo: 'AUTO',
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

export function isManualAtivo(atendimento) {
  if (!atendimento) {
    return false;
  }

  if (!atendimento.modo_manual_ate) {
    return false;
  }

  return new Date(atendimento.modo_manual_ate) > new Date();
}

export async function ativarManual(clienteId, minutes = 120) {
  if (!clienteId) {
    throw new Error('clienteId é obrigatório para ativar modo manual.');
  }

  const atendimento = await getAtendimentoByClienteId(clienteId);

  if (!atendimento) {
    throw new Error('Atendimento não encontrado para ativar modo manual.');
  }

  const minutosFinal = Number.isFinite(Number(minutes)) ? Number(minutes) : 120;
  const manualAte = new Date(Date.now() + minutosFinal * 60 * 1000);

  await db('atendimentos').where({ cliente_id: clienteId }).update({
    modo: 'MANUAL',
    modo_manual_ate: manualAte,
  });

  return manualAte;
}

export async function desativarManual(clienteId) {
  if (!clienteId) {
    throw new Error('clienteId é obrigatório para desativar modo manual.');
  }

  const atendimento = await getAtendimentoByClienteId(clienteId);

  if (!atendimento) {
    throw new Error('Atendimento não encontrado para desativar modo manual.');
  }

  return db('atendimentos').where({ cliente_id: clienteId }).update({
    modo: 'AUTO',
    modo_manual_ate: null,
    manual_motivo: null,
  });
}

export async function setManual(clienteId, { minutos = 120, motivo = null } = {}) {
  if (!clienteId) {
    throw new Error('clienteId é obrigatório para ajustar modo manual do atendimento.');
  }

  const manualAte = await ativarManual(clienteId, minutos);

  await db('atendimentos')
    .where({ cliente_id: clienteId })
    .update({ manual_motivo: motivo });

  return manualAte;
}

export async function setAuto(clienteId) {
  return desativarManual(clienteId);
}

export async function setModo(clienteId, modo, { ate = null, motivo = null } = {}) {
  if (!clienteId) {
    throw new Error('clienteId é obrigatório para ajustar modo do atendimento.');
  }

  const atendimento = await getAtendimentoByClienteId(clienteId);

  if (!atendimento) {
    throw new Error('Atendimento não encontrado para ajustar modo.');
  }

  if (modo === 'MANUAL') {
    const agora = Date.now();
    const expiracao = ate ?? new Date(agora + 2 * 60 * 60 * 1000);

    return db('atendimentos').where({ cliente_id: clienteId }).update({
      modo,
      modo_manual_ate: expiracao,
      manual_motivo: motivo,
    });
  }

  return db('atendimentos').where({ cliente_id: clienteId }).update({
    modo,
    modo_manual_ate: null,
    manual_motivo: null,
  });
}

export async function getModo(clienteId) {
  const atendimento = await getAtendimentoByClienteId(clienteId);
  return atendimento?.modo ?? null;
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
