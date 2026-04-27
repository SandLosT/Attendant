import { ATTENDANCE_MODE, ATTENDANCE_STATE, QUOTE_STATUS } from '../../domain/constants/attendance.js';
import { getOrCreateCustomer } from '../../repositories/customerRepository.js';
import { findAttendanceByCustomerId, getOrCreateAttendance, updateAttendance } from '../../repositories/attendanceRepository.js';
import { saveMessage, listRecentMessages } from '../../repositories/messageRepository.js';
import { saveImage } from '../../repositories/imageRepository.js';
import { createQuote, findOpenQuoteByCustomerId, updateQuote, findQuoteById } from '../../repositories/quoteRepository.js';
import { findSlot, createSlot, updateSlot } from '../../repositories/scheduleRepository.js';
import { assertMode, assertState } from '../../domain/services/attendanceDomainService.js';
import { saveBase64ToUploads } from '../../services/mediaService.js';
import { getImageEmbedding, estimateQuoteByEmbedding } from '../../integrations/embed/embedService.js';
import { sendWhatsAppMessage } from '../../integrations/messaging/wppMessagingService.js';
import { normalizePeriod } from '../../domain/services/scheduleDomainService.js';

const required = (value, field) => {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Campo obrigatório ausente: ${field}`);
  }
};

function asText(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

async function ensureSlot(data, periodo, capacidade = Number(process.env.AGENDA_CAPACIDADE_PADRAO || 3)) {
  const existing = await findSlot(data, periodo);
  if (existing) return existing;
  return createSlot({ data, periodo, capacidade, reservados: 0, bloqueado: 0 });
}

async function getActiveQuoteForCustomer(customerId, attendance = null) {
  if (attendance?.orcamento_id_atual) {
    const linked = await findQuoteById(attendance.orcamento_id_atual);
    if (linked && linked.cliente_id === customerId) return linked;
  }

  const open = await findOpenQuoteByCustomerId(customerId);
  if (open) {
    await updateAttendance(customerId, { orcamento_id_atual: open.id });
    return open;
  }
  return null;
}

export function getMcpToolDefinitions() {
  return [
    {
      name: 'get_customer_context',
      description: 'Carrega cliente, atendimento, orçamento em aberto e histórico recente.',
      inputSchema: { type: 'object', properties: { phone: { type: 'string' } }, required: ['phone'] },
      outputSchema: { type: 'object' },
      handler: async ({ phone }) => {
        required(phone, 'phone');
        const customer = await getOrCreateCustomer(phone);
        const attendance = await getOrCreateAttendance(customer.id);
        const activeQuote = await getActiveQuoteForCustomer(customer.id, attendance);
        const messages = (await listRecentMessages(customer.id, 12)).reverse();
        return { customer, attendance, activeQuote, messages };
      },
    },
    {
      name: 'get_current_attendance',
      description: 'Retorna (ou cria) atendimento atual de um cliente.',
      inputSchema: { type: 'object', properties: { customerId: { type: 'number' } }, required: ['customerId'] },
      outputSchema: { type: 'object' },
      handler: async ({ customerId }) => getOrCreateAttendance(customerId),
    },
    {
      name: 'save_incoming_message',
      description: 'Persiste mensagem recebida do cliente.',
      inputSchema: {
        type: 'object', properties: { customerId: { type: 'number' }, message: { type: 'string' } }, required: ['customerId', 'message'],
      },
      outputSchema: { type: 'object' },
      handler: async ({ customerId, message }) => {
        await saveMessage({ customerId, direction: 'entrada', content: asText(message) });
        return { ok: true };
      },
    },
    {
      name: 'save_outgoing_message',
      description: 'Persiste mensagem enviada ao cliente.',
      inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, message: { type: 'string' } }, required: ['customerId', 'message'] },
      outputSchema: { type: 'object' },
      handler: async ({ customerId, message }) => {
        await saveMessage({ customerId, direction: 'resposta', content: asText(message) });
        return { ok: true };
      },
    },
    {
      name: 'set_attendance_state',
      description: 'Atualiza estado do atendimento.',
      inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, state: { type: 'string' } }, required: ['customerId', 'state'] },
      outputSchema: { type: 'object' },
      handler: async ({ customerId, state }) => {
        assertState(state);
        return updateAttendance(customerId, { estado: state });
      },
    },
    {
      name: 'set_attendance_mode',
      description: 'Atualiza modo operacional AUTO/MANUAL preservando estado quando aplicável.',
      inputSchema: {
        type: 'object',
        properties: { customerId: { type: 'number' }, mode: { type: 'string' }, manualReason: { type: 'string' }, preserveState: { type: 'boolean' } },
        required: ['customerId', 'mode'],
      },
      outputSchema: { type: 'object' },
      handler: async ({ customerId, mode, manualReason = null, preserveState = true }) => {
        assertMode(mode);
        const attendance = await getOrCreateAttendance(customerId);
        const nextPayload = { modo: mode, manual_motivo: manualReason };
        if (mode === ATTENDANCE_MODE.MANUAL && attendance.estado !== ATTENDANCE_STATE.CLOSED && attendance.estado !== ATTENDANCE_STATE.CANCELLED) {
          nextPayload.estado = ATTENDANCE_STATE.HUMAN_HANDOFF;
        }
        if (mode === ATTENDANCE_MODE.AUTO && !preserveState && attendance.estado === ATTENDANCE_STATE.HUMAN_HANDOFF) {
          nextPayload.estado = ATTENDANCE_STATE.OPEN;
        }
        return updateAttendance(customerId, nextPayload);
      },
    },
    {
      name: 'analyze_damage_image',
      description: 'Armazena imagem enviada e executa análise por embeddings.',
      inputSchema: { type: 'object', properties: { phone: { type: 'string' }, base64: { type: 'string' }, mimetype: { type: 'string' }, filename: { type: 'string' } }, required: ['phone', 'base64'] },
      outputSchema: { type: 'object' },
      handler: async ({ phone, base64, mimetype, filename }) => {
        const customer = await getOrCreateCustomer(phone);
        const attendance = await getOrCreateAttendance(customer.id);
        await updateAttendance(customer.id, { estado: ATTENDANCE_STATE.IN_ANALYSIS });
        const saved = saveBase64ToUploads({ base64, mimetype, filename });
        const imageId = await saveImage({ customerId: customer.id, path: saved.relativePath, originalName: saved.originalName });
        const embedding = await getImageEmbedding(saved.filePath);
        const analysis = await estimateQuoteByEmbedding(embedding);
        return { customer, attendance, imageId, analysis, media: saved };
      },
    },
    {
      name: 'create_quote_from_analysis',
      description: 'Cria orçamento e vincula como orçamento atual do atendimento.',
      inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, imageId: { type: 'number' }, quotePayload: { type: 'object' } }, required: ['customerId', 'quotePayload'] },
      outputSchema: { type: 'object' },
      handler: async ({ customerId, imageId = null, quotePayload }) => {
        const quote = await createQuote({ customerId, imageId, ...quotePayload });
        await updateAttendance(customerId, { orcamento_id_atual: quote.id });
        return quote;
      },
    },
    {
      name: 'update_quote',
      description: 'Atualiza um orçamento existente.',
      inputSchema: { type: 'object', properties: { quoteId: { type: 'number' }, updates: { type: 'object' } }, required: ['quoteId', 'updates'] },
      outputSchema: { type: 'object' },
      handler: async ({ quoteId, updates }) => updateQuote(quoteId, updates),
    },
    {
      name: 'reserve_schedule_slot',
      description: 'Reserva slot de agenda e persiste no orçamento atual e atendimento.',
      inputSchema: {
        type: 'object',
        properties: { customerId: { type: 'number' }, date: { type: 'string' }, period: { type: 'string' } },
        required: ['customerId', 'date', 'period'],
      },
      outputSchema: { type: 'object' },
      handler: async ({ customerId, date, period }) => {
        const normalizedPeriod = normalizePeriod(period);
        if (!normalizedPeriod) return { ok: false, reason: 'INVALID_PERIOD' };
        const slot = await ensureSlot(date, normalizedPeriod);
        if (slot.bloqueado || slot.reservados >= slot.capacidade) return { ok: false, reason: 'UNAVAILABLE' };

        const attendance = await getOrCreateAttendance(customerId);
        const quote = await getActiveQuoteForCustomer(customerId, attendance);
        if (!quote) return { ok: false, reason: 'QUOTE_REQUIRED' };

        if (quote.slot_data && quote.slot_periodo && (quote.slot_data !== date || quote.slot_periodo !== normalizedPeriod)) {
          const previous = await findSlot(quote.slot_data, quote.slot_periodo);
          if (previous && previous.reservados > 0) {
            await updateSlot(previous.id, { reservados: previous.reservados - 1 });
          }
        }

        const updatedSlot = await updateSlot(slot.id, { reservados: slot.reservados + 1 });
        const updatedQuote = await updateQuote(quote.id, {
          status: quote.status === QUOTE_STATUS.DRAFT ? QUOTE_STATUS.APPROVED : quote.status,
          slot_data: date,
          slot_periodo: normalizedPeriod,
          data_preferida: date,
          periodo_preferido: normalizedPeriod,
        });
        await updateAttendance(customerId, { estado: ATTENDANCE_STATE.CLOSED, orcamento_id_atual: quote.id });
        return { ok: true, slot: updatedSlot, quote: updatedQuote };
      },
    },
    {
      name: 'release_schedule_slot',
      description: 'Libera slot reservado e remove vínculo do orçamento atual.',
      inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, date: { type: 'string' }, period: { type: 'string' } }, required: ['customerId', 'date', 'period'] },
      outputSchema: { type: 'object' },
      handler: async ({ customerId, date, period }) => {
        const normalizedPeriod = normalizePeriod(period);
        const slot = await findSlot(date, normalizedPeriod);
        if (!slot || slot.reservados <= 0) return { ok: false, reason: 'NO_RESERVATION' };

        const updatedSlot = await updateSlot(slot.id, { reservados: slot.reservados - 1 });
        const attendance = await getOrCreateAttendance(customerId);
        const quote = await getActiveQuoteForCustomer(customerId, attendance);
        if (quote && quote.slot_data === date && quote.slot_periodo === normalizedPeriod) {
          await updateQuote(quote.id, { slot_data: null, slot_periodo: null });
          await updateAttendance(customerId, { estado: ATTENDANCE_STATE.WAITING_SCHEDULE });
        }
        return { ok: true, slot: updatedSlot };
      },
    },
    {
      name: 'escalate_to_human',
      description: 'Escala atendimento para humano (estado + modo + motivo).',
      inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, reason: { type: 'string' } }, required: ['customerId'] },
      outputSchema: { type: 'object' },
      handler: async ({ customerId, reason }) => updateAttendance(customerId, {
        estado: ATTENDANCE_STATE.HUMAN_HANDOFF,
        modo: ATTENDANCE_MODE.MANUAL,
        manual_motivo: reason || null,
      }),
    },
    {
      name: 'resume_automatic_flow',
      description: 'Retoma atendimento automático sem resetar estado à força.',
      inputSchema: { type: 'object', properties: { customerId: { type: 'number' } }, required: ['customerId'] },
      outputSchema: { type: 'object' },
      handler: async ({ customerId }) => {
        const attendance = await getOrCreateAttendance(customerId);
        let nextState = attendance.estado;
        if (nextState === ATTENDANCE_STATE.HUMAN_HANDOFF) {
          nextState = attendance.orcamento_id_atual ? ATTENDANCE_STATE.WAITING_SCHEDULE : ATTENDANCE_STATE.OPEN;
        }
        return updateAttendance(customerId, { modo: ATTENDANCE_MODE.AUTO, estado: nextState, manual_motivo: null });
      },
    },
    {
      name: 'close_attendance',
      description: 'Fecha atendimento e encerra orçamento atual quando existir.',
      inputSchema: { type: 'object', properties: { customerId: { type: 'number' } }, required: ['customerId'] },
      outputSchema: { type: 'object' },
      handler: async ({ customerId }) => {
        const attendance = await getOrCreateAttendance(customerId);
        if (attendance.orcamento_id_atual) {
          await updateQuote(attendance.orcamento_id_atual, { status: QUOTE_STATUS.CLOSED, fechado_em: new Date() });
        }
        return updateAttendance(customerId, { estado: ATTENDANCE_STATE.CLOSED });
      },
    },
    {
      name: 'send_customer_message',
      description: 'Envia mensagem ao cliente pelo provedor WhatsApp.',
      inputSchema: { type: 'object', properties: { phone: { type: 'string' }, message: { type: 'string' } }, required: ['phone', 'message'] },
      outputSchema: { type: 'object' },
      handler: async ({ phone, message }) => {
        await sendWhatsAppMessage(phone, message);
        return { ok: true };
      },
    },
  ];
}
