import { getOrCreateCustomer } from '../../repositories/customerRepository.js';
import { getOrCreateAttendance, findAttendanceByCustomerId, updateAttendance } from '../../repositories/attendanceRepository.js';
import { saveMessage, listRecentMessages } from '../../repositories/messageRepository.js';
import { saveImage } from '../../repositories/imageRepository.js';
import { createQuote, updateQuote, findQuoteById } from '../../repositories/quoteRepository.js';
import { findSlot, createSlot, updateSlot } from '../../repositories/scheduleRepository.js';
import { assertState, assertMode } from '../../domain/services/attendanceDomainService.js';
import { saveBase64ToUploads } from '../../services/mediaService.js';
import { getImageEmbedding, estimateQuoteByEmbedding } from '../../integrations/embed/embedService.js';
import { sendWhatsAppMessage } from '../../integrations/messaging/wppMessagingService.js';

async function ensureSlot(data, periodo, capacidade = Number(process.env.AGENDA_CAPACIDADE_PADRAO || 3)) {
  const existing = await findSlot(data, periodo);
  if (existing) return existing;
  return createSlot({ data, periodo, capacidade, reservados: 0, bloqueado: 0 });
}

export function createMcpTools() {
  return {
    async get_customer_context({ phone }) {
      const customer = await getOrCreateCustomer(phone);
      const messages = await listRecentMessages(customer.id, 10);
      return { customer, messages: messages.reverse() };
    },

    async get_current_attendance({ customerId }) {
      return getOrCreateAttendance(customerId);
    },

    async save_incoming_message({ customerId, message }) {
      await saveMessage({ customerId, direction: 'entrada', content: message });
      return { ok: true };
    },

    async save_outgoing_message({ customerId, message }) {
      await saveMessage({ customerId, direction: 'resposta', content: message });
      return { ok: true };
    },

    async set_attendance_state({ customerId, state }) {
      assertState(state);
      return updateAttendance(customerId, { estado: state });
    },

    async set_attendance_mode({ customerId, mode, manualReason = null }) {
      assertMode(mode);
      return updateAttendance(customerId, { modo: mode, manual_motivo: manualReason });
    },

    async analyze_damage_image({ phone, base64, mimetype, filename }) {
      const customer = await getOrCreateCustomer(phone);
      const attendance = await getOrCreateAttendance(customer.id);
      const saved = saveBase64ToUploads({ base64, mimetype, filename });
      const imageId = await saveImage({ customerId: customer.id, path: saved.relativePath, originalName: saved.originalName });
      const embedding = await getImageEmbedding(saved.filePath);
      const analysis = await estimateQuoteByEmbedding(embedding);

      return { customer, attendance, imageId, analysis, media: saved };
    },

    async create_quote_from_analysis({ customerId, imageId, quotePayload }) {
      return createQuote({ customerId, imageId, ...quotePayload });
    },

    async update_quote({ quoteId, updates }) {
      return updateQuote(quoteId, updates);
    },

    async reserve_schedule_slot({ date, period }) {
      const slot = await ensureSlot(date, period);
      if (slot.bloqueado || slot.reservados >= slot.capacidade) return { ok: false, reason: 'UNAVAILABLE' };
      const updated = await updateSlot(slot.id, { reservados: slot.reservados + 1 });
      return { ok: true, slot: updated };
    },

    async release_schedule_slot({ date, period }) {
      const slot = await ensureSlot(date, period);
      if (slot.reservados <= 0) return { ok: false };
      const updated = await updateSlot(slot.id, { reservados: slot.reservados - 1 });
      return { ok: true, slot: updated };
    },

    async escalate_to_human({ customerId, reason }) {
      const attendance = await findAttendanceByCustomerId(customerId);
      if (!attendance) return null;
      return updateAttendance(customerId, { estado: 'HUMAN_HANDOFF', modo: 'MANUAL', manual_motivo: reason || null });
    },

    async resume_automatic_flow({ customerId }) {
      return updateAttendance(customerId, { modo: 'AUTO' });
    },

    async close_attendance({ customerId }) {
      return updateAttendance(customerId, { estado: 'CLOSED' });
    },

    async send_customer_message({ phone, message }) {
      await sendWhatsAppMessage(phone, message);
      return { ok: true };
    },

    async get_quote({ quoteId }) {
      return findQuoteById(quoteId);
    },
  };
}
