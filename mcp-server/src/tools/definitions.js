import { ATTENDANCE_MODE, ATTENDANCE_STATE, QUOTE_STATUS } from '../../../src/domain/constants/attendance.js';
import { getOrCreateCustomer } from '../../../src/repositories/customerRepository.js';
import { getOrCreateAttendance, updateAttendance } from '../../../src/repositories/attendanceRepository.js';
import { saveMessage, listRecentMessages } from '../../../src/repositories/messageRepository.js';
import { saveImage } from '../../../src/repositories/imageRepository.js';
import { createQuote, findOpenQuoteByCustomerId, updateQuote, findQuoteById } from '../../../src/repositories/quoteRepository.js';
import { findSlot, createSlot, updateSlot } from '../../../src/repositories/scheduleRepository.js';
import { assertMode, assertState } from '../../../src/domain/services/attendanceDomainService.js';
import { saveBase64ToUploads } from '../../../src/services/mediaService.js';
import { getImageEmbedding, estimateQuoteByEmbedding } from '../../../src/integrations/embed/embedService.js';
import { sendWhatsAppMessage } from '../../../src/integrations/messaging/wppMessagingService.js';
import { normalizePeriod } from '../../../src/domain/services/scheduleDomainService.js';
import { getStoreInfo } from '../../../src/repositories/storeInfoRepository.js';

const required = (value, field) => {
  if (value === undefined || value === null || value === '') throw new Error(`Campo obrigatório ausente: ${field}`);
};

const asText = (value) => (typeof value === 'string' ? value : String(value ?? ''));
const SIGNAL_PREFIX = '[ATTENDANCE_SIGNAL] ';

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

function parseOperationalSignals(messages = []) {
  return messages
    .filter((message) => message.tipo === 'resposta' && typeof message.mensagem === 'string' && message.mensagem.startsWith(SIGNAL_PREFIX))
    .map((message) => {
      try {
        return JSON.parse(message.mensagem.slice(SIGNAL_PREFIX.length));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(-6);
}

async function persistSignal({ customerId, payload }) {
  await saveMessage({
    customerId: Number(customerId),
    direction: 'resposta',
    content: `${SIGNAL_PREFIX}${JSON.stringify(payload)}`,
  });
}

export function getToolDefinitions() {
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
        const messages = (await listRecentMessages(customer.id, 20)).reverse();
        const operationalSignals = parseOperationalSignals(messages);
        return { customer, attendance, activeQuote, messages, operationalSignals };
      },
    },
    { name: 'get_current_attendance', description: 'Retorna (ou cria) atendimento atual do cliente.', inputSchema: { type: 'object', properties: { customerId: { type: 'number' } }, required: ['customerId'] }, outputSchema: { type: 'object' }, handler: async ({ customerId }) => getOrCreateAttendance(Number(customerId)) },
    { name: 'save_incoming_message', description: 'Persiste mensagem recebida do cliente.', inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, message: { type: 'string' } }, required: ['customerId', 'message'] }, outputSchema: { type: 'object' }, handler: async ({ customerId, message }) => { await saveMessage({ customerId: Number(customerId), direction: 'entrada', content: asText(message) }); return { ok: true }; } },
    { name: 'save_outgoing_message', description: 'Persiste mensagem enviada ao cliente.', inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, message: { type: 'string' } }, required: ['customerId', 'message'] }, outputSchema: { type: 'object' }, handler: async ({ customerId, message }) => { await saveMessage({ customerId: Number(customerId), direction: 'resposta', content: asText(message) }); return { ok: true }; } },
    { name: 'set_attendance_state', description: 'Atualiza estado do atendimento.', inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, state: { type: 'string' } }, required: ['customerId', 'state'] }, outputSchema: { type: 'object' }, handler: async ({ customerId, state }) => { assertState(state); return updateAttendance(Number(customerId), { estado: state }); } },
    { name: 'set_attendance_mode', description: 'Atualiza modo operacional AUTO/MANUAL preservando estado quando aplicável.', inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, mode: { type: 'string' }, manualReason: { type: 'string' }, preserveState: { type: 'boolean' } }, required: ['customerId', 'mode'] }, outputSchema: { type: 'object' }, handler: async ({ customerId, mode, manualReason = null, preserveState = true }) => { assertMode(mode); const attendance = await getOrCreateAttendance(Number(customerId)); const nextPayload = { modo: mode, manual_motivo: manualReason }; if (mode === ATTENDANCE_MODE.MANUAL && attendance.estado !== ATTENDANCE_STATE.CLOSED && attendance.estado !== ATTENDANCE_STATE.CANCELLED) nextPayload.estado = ATTENDANCE_STATE.HUMAN_HANDOFF; if (mode === ATTENDANCE_MODE.AUTO && !preserveState && attendance.estado === ATTENDANCE_STATE.HUMAN_HANDOFF) nextPayload.estado = ATTENDANCE_STATE.OPEN; return updateAttendance(Number(customerId), nextPayload); } },
    { name: 'analyze_damage_image', description: 'Armazena imagem recebida e executa análise por embeddings.', inputSchema: { type: 'object', properties: { phone: { type: 'string' }, base64: { type: 'string' }, mimetype: { type: 'string' }, filename: { type: 'string' } }, required: ['phone', 'base64'] }, outputSchema: { type: 'object' }, handler: async ({ phone, base64, mimetype, filename }) => { const customer = await getOrCreateCustomer(phone); const attendance = await getOrCreateAttendance(customer.id); await updateAttendance(customer.id, { estado: ATTENDANCE_STATE.IN_ANALYSIS }); const saved = saveBase64ToUploads({ base64, mimetype, filename }); const imageId = await saveImage({ customerId: customer.id, path: saved.relativePath, originalName: saved.originalName }); const embedding = await getImageEmbedding(saved.filePath); const analysis = await estimateQuoteByEmbedding(embedding); return { customer, attendance, imageId, analysis, media: saved }; } },
    { name: 'create_quote_from_analysis', description: 'Cria orçamento e vincula ao atendimento atual.', inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, imageId: { type: 'number' }, quotePayload: { type: 'object' } }, required: ['customerId', 'quotePayload'] }, outputSchema: { type: 'object' }, handler: async ({ customerId, imageId = null, quotePayload }) => { const quote = await createQuote({ customerId: Number(customerId), imageId, ...quotePayload }); await updateAttendance(Number(customerId), { orcamento_id_atual: quote.id }); return quote; } },
    { name: 'update_quote', description: 'Atualiza um orçamento existente.', inputSchema: { type: 'object', properties: { quoteId: { type: 'number' }, updates: { type: 'object' } }, required: ['quoteId', 'updates'] }, outputSchema: { type: 'object' }, handler: async ({ quoteId, updates }) => updateQuote(Number(quoteId), updates) },
    { name: 'reserve_schedule_slot', description: 'Reserva agenda e persiste no orçamento atual.', inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, date: { type: 'string' }, period: { type: 'string' } }, required: ['customerId', 'date', 'period'] }, outputSchema: { type: 'object' }, handler: async ({ customerId, date, period }) => { const normalizedPeriod = normalizePeriod(period); if (!normalizedPeriod) return { ok: false, reason: 'INVALID_PERIOD' }; const slot = await ensureSlot(date, normalizedPeriod); if (slot.bloqueado || slot.reservados >= slot.capacidade) return { ok: false, reason: 'UNAVAILABLE' }; const attendance = await getOrCreateAttendance(Number(customerId)); const quote = await getActiveQuoteForCustomer(Number(customerId), attendance); if (!quote) return { ok: false, reason: 'QUOTE_REQUIRED' }; if (quote.slot_data && quote.slot_periodo && (quote.slot_data !== date || quote.slot_periodo !== normalizedPeriod)) { const previous = await findSlot(quote.slot_data, quote.slot_periodo); if (previous && previous.reservados > 0) await updateSlot(previous.id, { reservados: previous.reservados - 1 }); } const updatedSlot = await updateSlot(slot.id, { reservados: slot.reservados + 1 }); const updatedQuote = await updateQuote(quote.id, { status: quote.status === QUOTE_STATUS.DRAFT ? QUOTE_STATUS.APPROVED : quote.status, slot_data: date, slot_periodo: normalizedPeriod, data_preferida: date, periodo_preferido: normalizedPeriod }); await updateAttendance(Number(customerId), { estado: ATTENDANCE_STATE.CLOSED, orcamento_id_atual: quote.id }); return { ok: true, slot: updatedSlot, quote: updatedQuote }; } },
    { name: 'release_schedule_slot', description: 'Libera slot reservado.', inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, date: { type: 'string' }, period: { type: 'string' } }, required: ['customerId', 'date', 'period'] }, outputSchema: { type: 'object' }, handler: async ({ customerId, date, period }) => { const normalizedPeriod = normalizePeriod(period); const slot = await findSlot(date, normalizedPeriod); if (!slot || slot.reservados <= 0) return { ok: false, reason: 'NO_RESERVATION' }; const updatedSlot = await updateSlot(slot.id, { reservados: slot.reservados - 1 }); const attendance = await getOrCreateAttendance(Number(customerId)); const quote = await getActiveQuoteForCustomer(Number(customerId), attendance); if (quote && quote.slot_data === date && quote.slot_periodo === normalizedPeriod) { await updateQuote(quote.id, { slot_data: null, slot_periodo: null }); await updateAttendance(Number(customerId), { estado: ATTENDANCE_STATE.WAITING_SCHEDULE }); } return { ok: true, slot: updatedSlot }; } },
    { name: 'escalate_to_human', description: 'Escala atendimento para humano (modo MANUAL + estado HUMAN_HANDOFF).', inputSchema: { type: 'object', properties: { customerId: { type: 'number' }, reason: { type: 'string' } }, required: ['customerId'] }, outputSchema: { type: 'object' }, handler: async ({ customerId, reason }) => updateAttendance(Number(customerId), { estado: ATTENDANCE_STATE.HUMAN_HANDOFF, modo: ATTENDANCE_MODE.MANUAL, manual_motivo: reason || null }) },
    { name: 'resume_automatic_flow', description: 'Retoma atendimento automático preservando contexto.', inputSchema: { type: 'object', properties: { customerId: { type: 'number' } }, required: ['customerId'] }, outputSchema: { type: 'object' }, handler: async ({ customerId }) => { const attendance = await getOrCreateAttendance(Number(customerId)); let nextState = attendance.estado; if (nextState === ATTENDANCE_STATE.HUMAN_HANDOFF) nextState = attendance.orcamento_id_atual ? ATTENDANCE_STATE.WAITING_SCHEDULE : ATTENDANCE_STATE.OPEN; return updateAttendance(Number(customerId), { modo: ATTENDANCE_MODE.AUTO, estado: nextState, manual_motivo: null }); } },
    {
      name: 'register_attendance_constraint',
      description: 'Registra constraints/pêndencias reais do fluxo e pode atualizar estado operacional.',
      inputSchema: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          kind: { type: 'string' },
          detail: { type: 'string' },
          blockedStage: { type: 'string' },
          pendingItems: { type: 'array', items: { type: 'string' } },
          alternatives: { type: 'array', items: { type: 'string' } },
          setState: { type: 'string' },
          setMode: { type: 'string' },
          topicShift: { type: 'string' },
          missingRequiredInput: { type: 'array', items: { type: 'string' } },
          customerPreference: { type: 'string' },
          urgency: { type: 'string' },
          nextBestGoal: { type: 'string' },
          handoffRequested: { type: 'boolean' },
        },
        required: ['customerId', 'kind'],
      },
      outputSchema: { type: 'object' },
      handler: async ({ customerId, kind, detail = null, blockedStage = null, pendingItems = [], alternatives = [], setState = null, setMode = null, topicShift = null, missingRequiredInput = [], customerPreference = null, urgency = null, nextBestGoal = null, handoffRequested = false }) => {
        const normalizedCustomerId = Number(customerId);
        const event = {
          kind,
          detail,
          blockedStage,
          pendingItems,
          alternatives,
          topicShift,
          missingRequiredInput,
          customerPreference,
          urgency,
          nextBestGoal,
          handoffRequested,
          createdAt: new Date().toISOString(),
        };

        await persistSignal({ customerId: normalizedCustomerId, payload: event });

        const patch = {};
        if (setState) {
          assertState(setState);
          patch.estado = setState;
        }
        if (setMode) {
          assertMode(setMode);
          patch.modo = setMode;
        }
        const attendance = Object.keys(patch).length
          ? await updateAttendance(normalizedCustomerId, patch)
          : await getOrCreateAttendance(normalizedCustomerId);

        return { ok: true, event, attendance };
      },
    },
    {
      name: 'register_conversation_signal',
      description: 'Registra interpretação estruturada da mensagem para memória conversacional (MCP).',
      inputSchema: {
        type: 'object',
        properties: {
          customerId: { type: 'number' },
          sourceText: { type: 'string' },
          state: { type: 'string' },
          mode: { type: 'string' },
          nextBestGoal: { type: 'string' },
          interpretation: { type: 'object' },
        },
        required: ['customerId', 'interpretation'],
      },
      outputSchema: { type: 'object' },
      handler: async ({ customerId, sourceText = '', state = null, mode = null, nextBestGoal = null, interpretation }) => {
        const normalizedCustomerId = Number(customerId);
        const event = {
          kind: 'MESSAGE_INTERPRETATION',
          state,
          mode,
          sourceText,
          nextBestGoal,
          primarySignal: interpretation?.primarySignal || 'NONE',
          secondarySignals: interpretation?.secondarySignals || [],
          blockingConstraint: interpretation?.blockingConstraint || null,
          missingRequiredInput: interpretation?.missingRequiredInput || [],
          handoffRequested: Boolean(interpretation?.handoffRequested),
          topicShift: interpretation?.topicShift || null,
          urgency: interpretation?.urgency || 'NORMAL',
          customerPreference: interpretation?.customerPreference || null,
          confidence: interpretation?.confidence || 0,
          recommendedNextMoves: interpretation?.recommendedNextMoves || [],
          createdAt: new Date().toISOString(),
        };
        await persistSignal({ customerId: normalizedCustomerId, payload: event });
        return { ok: true, event };
      },
    },
    { name: 'close_attendance', description: 'Fecha atendimento e encerra orçamento atual quando existir.', inputSchema: { type: 'object', properties: { customerId: { type: 'number' } }, required: ['customerId'] }, outputSchema: { type: 'object' }, handler: async ({ customerId }) => { const attendance = await getOrCreateAttendance(Number(customerId)); if (attendance.orcamento_id_atual) await updateQuote(attendance.orcamento_id_atual, { status: QUOTE_STATUS.CLOSED, fechado_em: new Date() }); return updateAttendance(Number(customerId), { estado: ATTENDANCE_STATE.CLOSED }); } },
    { name: 'send_customer_message', description: 'Envia mensagem ao cliente pelo provedor WhatsApp.', inputSchema: { type: 'object', properties: { phone: { type: 'string' }, message: { type: 'string' } }, required: ['phone', 'message'] }, outputSchema: { type: 'object' }, handler: async ({ phone, message }) => { await sendWhatsAppMessage(phone, message); return { ok: true }; } },
    {
      name: 'get_shop_info',
      description: 'Retorna informações de contato e endereço da loja.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: { type: 'object' },
      handler: async () => {
        const shop = await getStoreInfo();
        if (!shop) return { ok: false, reason: 'SHOP_INFO_NOT_FOUND' };
        return { ok: true, ...shop };
      },
    },
  ];
}
