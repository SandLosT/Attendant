import express from 'express';
import { ownerAuth } from '../http/middleware/ownerAuth.js';
import { listQuotesByStatus, findQuoteById, updateQuote } from '../repositories/quoteRepository.js';
import { findAttendanceByCustomerId, updateAttendance } from '../repositories/attendanceRepository.js';
import { ATTENDANCE_MODE, ATTENDANCE_STATE, QUOTE_STATUS } from '../domain/constants/attendance.js';
import { createMcpTools } from '../mcp/tools/registry.js';

const router = express.Router();
const mcpTools = createMcpTools();

router.get('/pwa*', (_req, res, next) => next());
router.use(ownerAuth);

router.get('/orcamentos', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : QUOTE_STATUS.NEEDS_HUMAN;
  const orcamentos = await listQuotesByStatus(status);
  return res.json({ status, orcamentos });
});

router.get('/orcamentos/:id', async (req, res) => {
  const orcamento = await findQuoteById(req.params.id);
  if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' });
  return res.json({ orcamento });
});

router.post('/orcamentos/:id/aprovar', async (req, res) => {
  const orcamento = await findQuoteById(req.params.id);
  if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' });
  const updated = await updateQuote(orcamento.id, {
    status: QUOTE_STATUS.APPROVED,
    data_agendada: req.body?.data_agendada || null,
  });
  await updateAttendance(orcamento.cliente_id, { estado: ATTENDANCE_STATE.CLOSED, orcamento_id_atual: updated.id });
  return res.json({ ok: true, orcamento: updated });
});

router.post('/orcamentos/:id/recusar', async (req, res) => {
  const orcamento = await findQuoteById(req.params.id);
  if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' });
  const updated = await updateQuote(orcamento.id, {
    status: QUOTE_STATUS.REJECTED,
    details: { motivo: req.body?.motivo || null },
  });
  await updateAttendance(orcamento.cliente_id, { estado: ATTENDANCE_STATE.HUMAN_HANDOFF, modo: ATTENDANCE_MODE.MANUAL, orcamento_id_atual: updated.id });
  return res.json({ ok: true, orcamento: updated });
});

router.post('/clientes/:clienteId/takeover', async (req, res) => {
  const atendimento = await findAttendanceByCustomerId(req.params.clienteId);
  if (!atendimento) return res.status(404).json({ erro: 'Atendimento não encontrado' });
  const updated = await mcpTools.set_attendance_mode({
    customerId: Number(req.params.clienteId),
    mode: ATTENDANCE_MODE.MANUAL,
    manualReason: req.body?.motivo || 'Takeover manual',
  });
  return res.json({ ok: true, atendimento: updated });
});

router.post('/orcamentos/:id/fechar_manual', async (req, res) => {
  const { valor_final, data_agendada, observacao } = req.body || {};
  const orcamento = await findQuoteById(req.params.id);
  if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' });

  const updatedQuote = await updateQuote(orcamento.id, {
    status: QUOTE_STATUS.CLOSED,
    valor_final: valor_final ?? null,
    data_agendada: data_agendada ?? null,
    fechado_em: new Date(),
    details: { manual_observacao: observacao || null },
  });

  await mcpTools.close_attendance({ customerId: Number(orcamento.cliente_id) });

  return res.json({ orcamento: updatedQuote });
});

router.post('/clientes/:clienteId/interferir', async (req, res) => {
  const atendimento = await findAttendanceByCustomerId(req.params.clienteId);
  if (!atendimento) return res.status(404).json({ erro: 'Atendimento não encontrado' });

  const updated = await mcpTools.escalate_to_human({
    customerId: Number(req.params.clienteId),
    reason: req.body?.motivo || 'Intervenção manual',
  });

  return res.json({ ok: true, atendimento: updated });
});

router.post('/clientes/:clienteId/devolver', async (req, res) => {
  const atendimento = await findAttendanceByCustomerId(req.params.clienteId);
  if (!atendimento) return res.status(404).json({ erro: 'Atendimento não encontrado' });

  const updated = await mcpTools.resume_automatic_flow({ customerId: Number(req.params.clienteId) });

  return res.json({ ok: true, atendimento: updated });
});

export default router;
