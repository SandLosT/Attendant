import express from 'express';
import { db } from '../database/index.js';
import { enviarMensagem } from '../services/wppconnectService.js';

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

async function buscarOrcamentosPorStatus(status) {
  return db('orcamentos as o')
    .select('o.*', 'c.telefone as cliente_telefone', 'c.nome as cliente_nome')
    .join('clientes as c', 'c.id', 'o.cliente_id')
    .where('o.status', status)
    .orderBy('o.id', 'desc');
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
    .select('o.*', 'c.telefone as cliente_telefone', 'c.nome as cliente_nome')
    .join('clientes as c', 'c.id', 'o.cliente_id')
    .where('o.id', id)
    .first();

  if (!orcamento) {
    return res.status(404).json({ erro: 'Orçamento não encontrado' });
  }

  let imagem = null;

  if (orcamento.imagem_id) {
    imagem = await db('imagens').where({ id: orcamento.imagem_id }).first();
  }

  if (!imagem) {
    imagem = await db('imagens')
      .where({ cliente_id: orcamento.cliente_id })
      .orderBy('id', 'desc')
      .first();
  }

  return res.json({ orcamento, imagem });
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

export default router;
