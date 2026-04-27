import express from 'express';
import { ownerAuth } from '../http/middleware/ownerAuth.js';
import * as quoteRepository from '../repositories/quoteRepository.js';
import * as attendanceRepository from '../repositories/attendanceRepository.js';
import { ATTENDANCE_MODE, ATTENDANCE_STATE, QUOTE_STATUS } from '../domain/constants/attendance.js';
import { getMcpClient } from '../integrations/mcp/mcpClient.js';

export function createOwnerRouter({
  mcpClient = getMcpClient(),
  repos = {
    listQuotesByStatus: quoteRepository.listQuotesByStatus,
    findQuoteById: quoteRepository.findQuoteById,
    updateQuote: quoteRepository.updateQuote,
    findAttendanceByCustomerId: attendanceRepository.findAttendanceByCustomerId,
    updateAttendance: attendanceRepository.updateAttendance,
  },
} = {}) {
  const router = express.Router();

  router.get('/pwa*', (_req, res, next) => next());
  router.use(ownerAuth);

  router.get('/orcamentos', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : QUOTE_STATUS.NEEDS_HUMAN;
    const orcamentos = await repos.listQuotesByStatus(status);
    return res.json({ status, orcamentos });
  });

  router.get('/orcamentos/:id', async (req, res) => {
    const orcamento = await repos.findQuoteById(req.params.id);
    if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' });
    return res.json({ orcamento });
  });

  router.post('/orcamentos/:id/aprovar', async (req, res) => {
    const orcamento = await repos.findQuoteById(req.params.id);
    if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' });
    const updated = await repos.updateQuote(orcamento.id, {
    status: QUOTE_STATUS.APPROVED,
    data_agendada: req.body?.data_agendada || null,
  });
    await repos.updateAttendance(orcamento.cliente_id, {
    estado: ATTENDANCE_STATE.CLOSED,
    modo: ATTENDANCE_MODE.MANUAL,
    orcamento_id_atual: updated.id,
    manual_motivo: 'Aprovação manual do especialista',
  });
    return res.json({ ok: true, orcamento: updated });
  });

  router.post('/orcamentos/:id/recusar', async (req, res) => {
    const orcamento = await repos.findQuoteById(req.params.id);
    if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' });
    const updated = await repos.updateQuote(orcamento.id, {
    status: QUOTE_STATUS.REJECTED,
    details: { ...orcamento.details, motivo: req.body?.motivo || null },
  });
    await repos.updateAttendance(orcamento.cliente_id, { estado: ATTENDANCE_STATE.HUMAN_HANDOFF, modo: ATTENDANCE_MODE.MANUAL, orcamento_id_atual: updated.id });
    return res.json({ ok: true, orcamento: updated });
  });

  router.post('/clientes/:clienteId/takeover', async (req, res) => {
    const atendimento = await repos.findAttendanceByCustomerId(req.params.clienteId);
    if (!atendimento) return res.status(404).json({ erro: 'Atendimento não encontrado' });
    const updated = await mcpClient.callTool('set_attendance_mode', {
    customerId: Number(req.params.clienteId),
    mode: ATTENDANCE_MODE.MANUAL,
    manualReason: req.body?.motivo || 'Takeover manual',
  });
    return res.json({ ok: true, atendimento: updated });
  });

  router.post('/orcamentos/:id/fechar_manual', async (req, res) => {
  const { valor_final, data_agendada, observacao } = req.body || {};
    const orcamento = await repos.findQuoteById(req.params.id);
  if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' });

    const updatedQuote = await repos.updateQuote(orcamento.id, {
    status: QUOTE_STATUS.CLOSED,
    valor_final: valor_final ?? null,
    data_agendada: data_agendada ?? null,
    fechado_em: new Date(),
    details: { manual_observacao: observacao || null },
  });

    await mcpClient.callTool('close_attendance', { customerId: Number(orcamento.cliente_id) });

    return res.json({ orcamento: updatedQuote });
  });

  router.post('/clientes/:clienteId/interferir', async (req, res) => {
    const atendimento = await repos.findAttendanceByCustomerId(req.params.clienteId);
    if (!atendimento) return res.status(404).json({ erro: 'Atendimento não encontrado' });

  const updated = await mcpClient.callTool('escalate_to_human', {
    customerId: Number(req.params.clienteId),
    reason: req.body?.motivo || 'Intervenção manual',
  });

    return res.json({ ok: true, atendimento: updated });
  });

  router.post('/clientes/:clienteId/devolver', async (req, res) => {
    const atendimento = await repos.findAttendanceByCustomerId(req.params.clienteId);
    if (!atendimento) return res.status(404).json({ erro: 'Atendimento não encontrado' });

  const updated = await mcpClient.callTool('resume_automatic_flow', { customerId: Number(req.params.clienteId) });

    return res.json({ ok: true, atendimento: updated });
  });

  router.post('/clientes/:clienteId/cancelar', async (req, res) => {
    const atendimento = await repos.findAttendanceByCustomerId(req.params.clienteId);
    if (!atendimento) return res.status(404).json({ erro: 'Atendimento não encontrado' });

    const updated = await repos.updateAttendance(Number(req.params.clienteId), {
    estado: ATTENDANCE_STATE.CANCELLED,
    modo: ATTENDANCE_MODE.MANUAL,
    manual_motivo: req.body?.motivo || 'Cancelado pelo especialista',
  });

    return res.json({ ok: true, atendimento: updated });
  });

  return router;
}

export default createOwnerRouter();
