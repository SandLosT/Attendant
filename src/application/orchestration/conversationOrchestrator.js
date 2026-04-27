import { ATTENDANCE_MODE, ATTENDANCE_STATE, QUOTE_STATUS } from '../../domain/constants/attendance.js';
import { inferQuoteFromImageAnalysis } from '../../domain/services/quoteDomainService.js';
import { parseDateAndPeriod, normalizePeriod } from '../../domain/services/scheduleDomainService.js';
import { shouldAutomationReply } from '../../domain/services/attendanceDomainService.js';
import { generateAssistantReply } from '../../integrations/ai/openaiChatService.js';

function buildSystemPrompt() {
  return [
    'Você é a Ana, atendente humana de oficina automotiva.',
    'Responda em português do Brasil, com frases curtas, educadas e naturais.',
    'Seja objetiva e calorosa. Evite frases robóticas e repetição.',
    'Nunca invente preço fechado, disponibilidade confirmada ou prazo técnico sem contexto.',
    'Quando faltar informação, peça só uma coisa por vez.',
  ].join(' ');
}

function defaultFallback(state) {
  if (state === ATTENDANCE_STATE.WAITING_IMAGE) return 'Consegue me enviar uma foto do dano? Assim te oriento melhor.';
  if (state === ATTENDANCE_STATE.WAITING_SCHEDULE) return 'Me passa uma data (dd/mm) e, se quiser, manhã ou tarde.';
  if (state === ATTENDANCE_STATE.HUMAN_HANDOFF) return 'Esse caso eu já deixei com um especialista, tá? Ele segue daqui.';
  return 'Perfeito, me conta mais um pouquinho para eu te ajudar certinho.';
}

export class ConversationOrchestrator {
  constructor({ tools }) {
    this.tools = tools;
  }

  async handleIncomingText({ phone, text }) {
    const { customer, messages } = await this.tools.get_customer_context({ phone });
    const attendance = await this.tools.get_current_attendance({ customerId: customer.id });

    await this.tools.save_incoming_message({ customerId: customer.id, message: text });

    if (!shouldAutomationReply(attendance) || attendance.modo === ATTENDANCE_MODE.MANUAL) {
      return { replied: false, reason: 'manual_mode' };
    }

    const lower = text.toLowerCase();
    if (['cancelar', 'cancela', 'não quero orçamento', 'nao quero orcamento'].some((x) => lower.includes(x))) {
      await this.tools.set_attendance_state({ customerId: customer.id, state: ATTENDANCE_STATE.CANCELLED });
      return this.replyAndPersist({
        customerId: customer.id,
        phone,
        state: ATTENDANCE_STATE.CANCELLED,
        customerMessage: text,
        history: messages,
      });
    }

    const asksQuote = ['orçamento', 'orcamento', 'amassado', 'batida', 'preço', 'preco', 'valor'].some((x) => lower.includes(x));

    if (attendance.estado === ATTENDANCE_STATE.OPEN && asksQuote) {
      await this.tools.set_attendance_state({ customerId: customer.id, state: ATTENDANCE_STATE.WAITING_IMAGE });
      return this.replyAndPersist({
        customerId: customer.id,
        phone,
        state: ATTENDANCE_STATE.WAITING_IMAGE,
        customerMessage: text,
        history: messages,
      });
    }

    if (attendance.estado === ATTENDANCE_STATE.WAITING_SCHEDULE) {
      const { data, periodo } = parseDateAndPeriod(text);
      const period = normalizePeriod(periodo) || 'MANHA';
      if (!data) {
        return this.replyAndPersist({ customerId: customer.id, phone, state: attendance.estado, customerMessage: text, history: messages });
      }

      const reservation = await this.tools.reserve_schedule_slot({ date: data, period });
      if (!reservation.ok) {
        return this.replyAndPersist({ customerId: customer.id, phone, state: ATTENDANCE_STATE.WAITING_SCHEDULE, customerMessage: text, history: messages });
      }

      await this.tools.set_attendance_state({ customerId: customer.id, state: ATTENDANCE_STATE.CLOSED });
      return this.replyAndPersist({
        customerId: customer.id,
        phone,
        state: ATTENDANCE_STATE.CLOSED,
        customerMessage: `Agendamento reservado em ${data} ${period}.`,
        history: messages,
      });
    }

    return this.replyAndPersist({ customerId: customer.id, phone, state: attendance.estado, customerMessage: text, history: messages });
  }

  async handleIncomingImage({ phone, base64, mimetype, filename }) {
    const analysisResult = await this.tools.analyze_damage_image({ phone, base64, mimetype, filename });
    const quoteInference = inferQuoteFromImageAnalysis(analysisResult.analysis);

    const quote = await this.tools.create_quote_from_analysis({
      customerId: analysisResult.customer.id,
      imageId: analysisResult.imageId,
      quotePayload: quoteInference,
    });

    if (quoteInference.requiresHuman) {
      await this.tools.escalate_to_human({
        customerId: analysisResult.customer.id,
        reason: 'Baixa confiança na análise da imagem',
      });
      return this.replyAndPersist({
        customerId: analysisResult.customer.id,
        phone,
        state: ATTENDANCE_STATE.HUMAN_HANDOFF,
        customerMessage: 'Imagem recebida e encaminhada para especialista.',
        history: [],
      });
    }

    await this.tools.update_quote({
      quoteId: quote.id,
      updates: { status: QUOTE_STATUS.APPROVED },
    });
    await this.tools.set_attendance_state({ customerId: analysisResult.customer.id, state: ATTENDANCE_STATE.WAITING_SCHEDULE });

    return this.replyAndPersist({
      customerId: analysisResult.customer.id,
      phone,
      state: ATTENDANCE_STATE.WAITING_SCHEDULE,
      customerMessage: `Análise pronta. Valor estimado ${quoteInference.estimatedValue ?? 'a confirmar'}.`,
      history: [],
      quoteValue: quoteInference.estimatedValue,
    });
  }

  async replyAndPersist({ customerId, phone, state, customerMessage, history, quoteValue = null }) {
    const contextPrompt = [
      `estado_atendimento: ${state}`,
      `historico_recente: ${JSON.stringify((history || []).slice(-6))}`,
      `mensagem_cliente: ${customerMessage}`,
      quoteValue ? `valor_estimado: ${quoteValue}` : null,
      'se estado for WAITING_IMAGE, peça uma foto com naturalidade.',
      'se estado for WAITING_SCHEDULE, peça data e período de forma direta.',
      'se estado for HUMAN_HANDOFF, avise que especialista assume.',
    ].filter(Boolean).join('\n');

    const ai = await generateAssistantReply({ systemPrompt: buildSystemPrompt(), contextPrompt });
    const message = ai.ok && ai.content ? ai.content : defaultFallback(state);

    await this.tools.save_outgoing_message({ customerId, message });
    await this.tools.send_customer_message({ phone, message });

    return { replied: true, message, state };
  }
}
