import express from 'express';
import { db } from '../database/index.js';
import { enviarMensagem } from '../services/wppconnectService.js';
import {
  getAtendimentoByClienteId,
  getOrCreateAtendimento,
  setEstado,
  setModo,
} from '../services/atendimentoService.js';

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
    .where('o.status', status)
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

  await db('orcamentos')
    .where({ id })
    .update({
      status: 'APROVADO_MANUAL',
      valor_final: valor_final ?? null,
      data_agendada: data_agendada ?? orcamento.data_agendada ?? null,
      fechado_em: db.fn.now(),
      fechado_por: 'DONO',
      observacao: observacao ?? null,
    });

  const atendimento = await getAtendimentoByClienteId(orcamento.cliente_id);

  if (atendimento) {
    await setModo(orcamento.cliente_id, 'AUTO');
    await setEstado(orcamento.cliente_id, 'FINALIZADO');
  }

  const orcamentoAtualizado = await db('orcamentos').where({ id }).first();

  return res.json({ orcamento: orcamentoAtualizado });
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
  const { duracao_min } = req.body || {};
  const duracaoMinutos = Number(duracao_min) || 120;

  const atendimento = await getOrCreateAtendimento(clienteId);
  const agora = Date.now();
  const expiracao = new Date(agora + duracaoMinutos * 60 * 1000);

  await setModo(clienteId, 'MANUAL', { ate: expiracao, estadoAnterior: atendimento.estado });
  await setEstado(clienteId, 'HUMANO_ATIVO');

  const cliente = await db('clientes').where({ id: clienteId }).first();

  if (cliente?.telefone) {
    const mensagem = 'Perfeito, o responsável vai te atender agora.';
    try {
      await enviarMensagem(cliente.telefone, mensagem);
    } catch (error) {
      console.error('❌ Falha ao enviar WhatsApp:', error.message || error);
    }
  }

  return res.json({ ok: true });
});

router.post('/clientes/:clienteId/devolver', async (req, res) => {
  const { clienteId } = req.params;
  const atendimento = await getAtendimentoByClienteId(clienteId);

  if (!atendimento) {
    return res.status(404).json({ erro: 'Atendimento não encontrado' });
  }

  const estadoRetorno = atendimento.estado_anterior || 'AGUARDANDO_APROVACAO_DONO';

  await setModo(clienteId, 'AUTO');
  await setEstado(clienteId, estadoRetorno);

  return res.json({ ok: true });
});

export default router;

/*
Exemplos (Windows):
curl.exe -X POST "http://localhost:3001/owner/clientes/1/interferir" -H "Authorization: Bearer <TOKEN>"
curl.exe -X POST "http://localhost:3001/owner/orcamentos/1/fechar_manual" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" --data-raw "{\"valor_final\":450,\"data_agendada\":\"2026-01-10\",\"observacao\":\"Negociado no WhatsApp\"}"
*/
