import express from 'express';
import { db } from '../database/index.js';
import { enviarMensagem } from '../services/wppconnectService.js';
import {
  ativarManual,
  desativarManual,
  getAtendimentoByClienteId,
  getOrCreateAtendimento,
  setAuto,
  setEstado,
  setManual,
} from '../services/atendimentoService.js';
import {
  ensureSlotExists,
  liberarSlot,
  listarDisponibilidade,
  setBloqueado,
} from '../services/agendaService.js';
import { limparSlotPreReservado } from '../services/orcamentoService.js';

const router = express.Router();

function ownerAuth(req, res, next) {
  const expectedToken = process.env.OWNER_AUTH_TOKEN;
  const authHeader = req.get('Authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (!expectedToken) {
    return res.status(500).json({ erro: 'OWNER_AUTH_TOKEN não configurado' });
  }

  if (scheme !== 'Bearer' || !token || token !== expectedToken) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  return next();
}

router.use(ownerAuth);

function extrairSuggestedValue(detalhes) {
  if (!detalhes) {
    return null;
  }

  try {
    const parsed = typeof detalhes === 'string' ? JSON.parse(detalhes) : detalhes;
    return parsed?.suggested_value ?? null;
  } catch (error) {
    return null;
  }
}

function adicionarSuggestedValue(orcamentos) {
  return orcamentos.map((orcamento) => ({
    ...orcamento,
    suggested_value: extrairSuggestedValue(orcamento.detalhes),
  }));
}

function selecionarUltimaImagem() {
  return [
    db.raw(
      `(SELECT i.caminho FROM imagens i WHERE i.cliente_id = o.cliente_id ORDER BY i.id DESC LIMIT 1) AS ultima_imagem_caminho`
    ),
    db.raw(
      `(SELECT i.nome_original FROM imagens i WHERE i.cliente_id = o.cliente_id ORDER BY i.id DESC LIMIT 1) AS ultima_imagem_nome`
    ),
  ];
}

async function buscarOrcamentosPorStatus(status) {
  const orcamentos = await db('orcamentos as o')
    .select('o.*', 'c.telefone as cliente_telefone', 'c.nome as cliente_nome', ...selecionarUltimaImagem())
    .join('clientes as c', 'c.id', 'o.cliente_id')
    .where((builder) => {
      if (status === 'FINALIZADO_MANUAL') {
        builder.whereIn('o.status', ['FINALIZADO_MANUAL', 'FECHADO_MANUAL']);
      } else {
        builder.where('o.status', status);
      }
    })
    .orderBy('o.id', 'desc');

  return adicionarSuggestedValue(orcamentos);
}

router.get('/orcamentos', async (req, res) => {
  const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  let status = rawStatus || 'AGUARDANDO_APROVACAO_DONO';

  let orcamentos = await buscarOrcamentosPorStatus(status);

  if (!rawStatus && status === 'AGUARDANDO_APROVACAO_DONO' && orcamentos.length === 0) {
    status = 'PENDENTE';
    orcamentos = await buscarOrcamentosPorStatus(status);
  }

  if (!rawStatus && status === 'PENDENTE' && orcamentos.length === 0) {
    status = 'FINALIZADO_MANUAL';
    orcamentos = await buscarOrcamentosPorStatus(status);
  }

  return res.json({ status, orcamentos });
});

router.get('/orcamentos/:id', async (req, res) => {
  const { id } = req.params;

  const orcamento = await db('orcamentos as o')
    .select('o.*', 'c.telefone as cliente_telefone', 'c.nome as cliente_nome', ...selecionarUltimaImagem())
    .join('clientes as c', 'c.id', 'o.cliente_id')
    .where('o.id', id)
    .first();

  if (!orcamento) {
    return res.status(404).json({ erro: 'Orçamento não encontrado' });
  }

  let imagem = null;
  const orcamentoComSuggestedValue = {
    ...orcamento,
    suggested_value: extrairSuggestedValue(orcamento.detalhes),
  };

  if (orcamento.imagem_id) {
    imagem = await db('imagens').where({ id: orcamento.imagem_id }).first();
  }

  if (!imagem) {
    imagem = await db('imagens')
      .where({ cliente_id: orcamento.cliente_id })
      .orderBy('id', 'desc')
      .first();
  }

  return res.json({ orcamento: orcamentoComSuggestedValue, imagem });
});

router.post('/orcamentos/:id/aprovar', async (req, res) => {
  const { id } = req.params;
  const { data_agendada, observacao } = req.body || {};

  if (!data_agendada) {
    return res.status(400).json({ erro: 'data_agendada é obrigatória' });
  }

  const orcamento = await db('orcamentos').where({ id }).first();

  if (!orcamento) {
    return res.status(404).json({ erro: 'Orçamento não encontrado' });
  }

  await db('orcamentos')
    .where({ id })
    .update({
      status: 'APROVADO',
      data_agendada,
      aprovado_em: db.fn.now(),
    });

  await db('atendimentos')
    .where({ cliente_id: orcamento.cliente_id })
    .update({ estado: 'FINALIZADO' });

  const cliente = await db('clientes').where({ id: orcamento.cliente_id }).first();

  if (cliente?.telefone) {
    const mensagem = `Perfeito! Agendamos para ${data_agendada}. Qualquer coisa estamos à disposição.`;
    try {
      await enviarMensagem(cliente.telefone, mensagem);
    } catch (error) {
      console.error('❌ Falha ao enviar WhatsApp:', error.message || error);
    }
  }

  return res.json({
    ok: true,
    orcamento_id: Number(id),
    data_agendada,
    observacao: observacao ?? null,
  });
});

router.post('/orcamentos/:id/fechar_manual', async (req, res) => {
  const { id } = req.params;
  const { valor_final, data_agendada, observacao } = req.body || {};

  const orcamento = await db('orcamentos').where({ id }).first();

  if (!orcamento) {
    return res.status(404).json({ erro: 'Orçamento não encontrado' });
  }

  let detalhesAtualizados = orcamento.detalhes;
  if (observacao) {
    try {
      const detalhesJson =
        typeof orcamento.detalhes === 'string'
          ? JSON.parse(orcamento.detalhes || '{}')
          : orcamento.detalhes || {};
      detalhesAtualizados = JSON.stringify({
        ...detalhesJson,
        manual_observacao: observacao,
      });
    } catch (error) {
      detalhesAtualizados = JSON.stringify({ manual_observacao: observacao });
    }
  }

  await db('orcamentos')
    .where({ id })
    .update({
      status: 'FINALIZADO_MANUAL',
      valor_final: valor_final ?? null,
      data_agendada: data_agendada ?? orcamento.data_agendada ?? null,
      fechado_em: db.fn.now(),
      detalhes: detalhesAtualizados,
    });

  if (orcamento?.slot_data && orcamento?.slot_periodo && !data_agendada) {
    await liberarSlot(orcamento.slot_data, orcamento.slot_periodo);
    await limparSlotPreReservado(id);
  }

  const atendimento = await getAtendimentoByClienteId(orcamento.cliente_id);

  if (atendimento) {
    await desativarManual(orcamento.cliente_id);
    await setEstado(orcamento.cliente_id, 'FINALIZADO');
  }

  const orcamentoAtualizado = await db('orcamentos').where({ id }).first();

  return res.json({ orcamento: orcamentoAtualizado });
});

router.post('/clientes/:clienteId/takeover', async (req, res) => {
  const { clienteId } = req.params;
  const { minutes } = req.body || {};
  const duracaoMinutos = Number(minutes) || 120;

  await getOrCreateAtendimento(clienteId);
  const manualAte = await ativarManual(clienteId, duracaoMinutos);

  return res.json({ ok: true, modo: 'MANUAL', modo_manual_ate: manualAte });
});

router.post('/orcamentos/:id/recusar', async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body || {};
  const motivoFinal = motivo || 'precisa avaliacao presencial';

  const orcamento = await db('orcamentos').where({ id }).first();

  if (!orcamento) {
    return res.status(404).json({ erro: 'Orçamento não encontrado' });
  }

  await db('orcamentos')
    .where({ id })
    .update({
      status: 'RECUSADO',
      recusado_motivo: motivoFinal,
    });

  if (orcamento?.slot_data && orcamento?.slot_periodo) {
    await liberarSlot(orcamento.slot_data, orcamento.slot_periodo);
    await limparSlotPreReservado(id);
  }

  await db('atendimentos')
    .where({ cliente_id: orcamento.cliente_id })
    .update({ estado: 'ESCALADO_HUMANO' });

  const cliente = await db('clientes').where({ id: orcamento.cliente_id }).first();

  if (cliente?.telefone) {
    const mensagem =
      'Para esse caso, precisamos que um profissional avalie melhor presencialmente. Vamos te retornar em seguida.';
    try {
      await enviarMensagem(cliente.telefone, mensagem);
    } catch (error) {
      console.error('❌ Falha ao enviar WhatsApp:', error.message || error);
    }
  }

  return res.json({
    ok: true,
    orcamento_id: Number(id),
    motivo: motivoFinal,
  });
});

router.post('/clientes/:clienteId/interferir', async (req, res) => {
  const { clienteId } = req.params;
  const { minutos, motivo } = req.body || {};
  const duracaoMinutos = Number(minutos) || 120;

  await getOrCreateAtendimento(clienteId);

  const manualAte = await setManual(clienteId, {
    minutos: duracaoMinutos,
    motivo: motivo ?? null,
  });

  await setEstado(clienteId, 'ESCALADO_HUMANO');

  return res.json({ ok: true, modo: 'MANUAL', modo_manual_ate: manualAte });
});

router.post('/clientes/:clienteId/devolver', async (req, res) => {
  const { clienteId } = req.params;
  const atendimento = await getAtendimentoByClienteId(clienteId);

  if (!atendimento) {
    return res.status(404).json({ erro: 'Atendimento não encontrado' });
  }

  await setAuto(clienteId);

  return res.json({ ok: true, modo: 'AUTO' });
});

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

router.post('/agenda/gerar', async (req, res) => {
  const { dias, capacidade, a_partir_de } = req.body || {};

  const diasGerar = Number(dias) || Number(process.env.AGENDA_DIAS_GERAR) || 30;
  const capacidadePadrao =
    Number(capacidade) || Number(process.env.AGENDA_CAPACIDADE_PADRAO) || 3;

  const inicio = a_partir_de ? new Date(a_partir_de) : new Date();
  inicio.setHours(0, 0, 0, 0);

  let gerados = 0;

  for (let i = 0; i < diasGerar; i += 1) {
    const data = new Date(inicio);
    data.setDate(inicio.getDate() + i);
    const dataISO = formatDate(data);

    const slotManha = await ensureSlotExists(dataISO, 'MANHA', capacidadePadrao);
    const slotTarde = await ensureSlotExists(dataISO, 'TARDE', capacidadePadrao);

    if (slotManha?.criado) {
      gerados += 1;
    }

    if (slotTarde?.criado) {
      gerados += 1;
    }
  }

  return res.json({ ok: true, gerados });
});

router.get('/agenda', async (req, res) => {
  const fromQuery = typeof req.query.from === 'string' ? req.query.from : null;
  const toQuery = typeof req.query.to === 'string' ? req.query.to : null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + 14);

  const from = fromQuery || formatDate(hoje);
  const to = toQuery || formatDate(limite);

  const disponibilidade = await listarDisponibilidade(from, to);

  return res.json({ from, to, slots: disponibilidade });
});

router.post('/agenda/bloquear', async (req, res) => {
  const { data, periodo, bloqueado } = req.body || {};

  if (!data || !periodo) {
    return res.status(400).json({ erro: 'data e periodo são obrigatórios' });
  }

  const atualizado = await setBloqueado(data, periodo, Boolean(bloqueado));

  return res.json({ ok: atualizado });
});

export default router;

/*
Exemplos (Windows):
Interferir:
curl.exe -X POST http://localhost:3001/owner/clientes/1/interferir -H "Authorization: Bearer dev-token-123" -H "Content-Type: application/json" --data-raw "{\"minutos\":120,\"motivo\":\"avaliar pessoalmente\"}"

Devolver:
curl.exe -X POST http://localhost:3001/owner/clientes/1/devolver -H "Authorization: Bearer dev-token-123"

Fechar manual:
curl.exe -X POST http://localhost:3001/owner/orcamentos/1/fechar_manual -H "Authorization: Bearer dev-token-123" -H "Content-Type: application/json" --data-raw "{\"valor_final\":650,\"observacao\":\"fechado via whatsapp\"}"
*/
