import { ATTENDANCE_MODE, ATTENDANCE_STATE, QUOTE_STATUS } from '../../domain/constants/attendance.js';
import { inferQuoteFromImageAnalysis } from '../../domain/services/quoteDomainService.js';
import { parseDateAndPeriod, normalizePeriod } from '../../domain/services/scheduleDomainService.js';
import { shouldAutomationReply } from '../../domain/services/attendanceDomainService.js';
import { generateAssistantReply } from '../../integrations/ai/openaiChatService.js';

function buildSystemPrompt() {
  return [
    'Você é Ana, atendente de oficina.',
    'Tom: humano, cordial, objetivo, com frases curtas e naturais.',
    'Evite respostas robóticas, repetitivas e genéricas.',
    'Peça apenas o próximo dado necessário, um por vez.',
    'Não confirme reserva/valor fechado sem ferramenta confirmar.',
    'Responda em português do Brasil e no máximo 2 frases.',
  ].join(' ');
}

function compactHistory(messages) {
  return (messages || []).slice(-6).map((m) => `${m.tipo === 'entrada' ? 'Cliente' : 'Ana'}: ${m.mensagem}`);
}

function objectiveByState(state) {
  if (state === ATTENDANCE_STATE.WAITING_IMAGE) return 'coletar foto do dano';
  if (state === ATTENDANCE_STATE.WAITING_SCHEDULE) return 'fechar data e período do atendimento';
  if (state === ATTENDANCE_STATE.HUMAN_HANDOFF) return 'informar que um especialista humano assumiu';
  if (state === ATTENDANCE_STATE.IN_ANALYSIS) return 'informar que a imagem está em análise';
  return 'entender a necessidade do cliente';
}

function minimalFallback(state, needsPeriod = false) {
  if (needsPeriod) return 'Perfeito, para essa data você prefere manhã ou tarde?';
  if (state === ATTENDANCE_STATE.WAITING_IMAGE) return 'Consegue me enviar uma foto do dano para eu seguir com o orçamento?';
  if (state === ATTENDANCE_STATE.WAITING_SCHEDULE) return 'Me diz a data e o período (manhã ou tarde) que você prefere.';
  if (state === ATTENDANCE_STATE.HUMAN_HANDOFF) return 'Deixei seu atendimento com um especialista humano, ele segue com você já já.';
  return 'Entendi. Me passa mais um detalhe para eu te ajudar com precisão.';
}

export class ConversationOrchestrator {
  constructor({ tools }) {
    this.tools = tools;
  }

  async handleIncomingText({ phone, text }) {
    const context = await this.tools.get_customer_context({ phone });
    const customer = context.customer;
    const attendance = context.attendance;

    await this.tools.save_incoming_message({ customerId: customer.id, message: text });

    if (!shouldAutomationReply(attendance) || attendance.modo === ATTENDANCE_MODE.MANUAL) {
      return { replied: false, reason: 'manual_mode' };
    }

    const lower = text.toLowerCase();

    if (['cancelar', 'cancela', 'não quero orçamento', 'nao quero orcamento'].some((x) => lower.includes(x))) {
      await this.tools.set_attendance_state({ customerId: customer.id, state: ATTENDANCE_STATE.CANCELLED });
      return this.replyAndPersist({ customerId: customer.id, phone, state: ATTENDANCE_STATE.CANCELLED, customerMessage: text, context });
    }

    const asksQuote = ['orçamento', 'orcamento', 'amassado', 'batida', 'preço', 'preco', 'valor'].some((x) => lower.includes(x));

    if (attendance.estado === ATTENDANCE_STATE.OPEN && asksQuote) {
      await this.tools.set_attendance_state({ customerId: customer.id, state: ATTENDANCE_STATE.WAITING_IMAGE });
      return this.replyAndPersist({ customerId: customer.id, phone, state: ATTENDANCE_STATE.WAITING_IMAGE, customerMessage: text, context });
    }

    if (attendance.estado === ATTENDANCE_STATE.WAITING_SCHEDULE) {
      const { data, periodo } = parseDateAndPeriod(text);
      const normalizedPeriod = normalizePeriod(periodo);

      if (!data) {
        return this.replyAndPersist({ customerId: customer.id, phone, state: attendance.estado, customerMessage: text, context });
      }
      if (!normalizedPeriod) {
        return this.replyAndPersist({
          customerId: customer.id,
          phone,
          state: ATTENDANCE_STATE.WAITING_SCHEDULE,
          customerMessage: `${text} (falta período)`,
          context,
          needsPeriod: true,
        });
      }

      const reservation = await this.tools.reserve_schedule_slot({ customerId: customer.id, date: data, period: normalizedPeriod });
      if (!reservation.ok) {
        return this.replyAndPersist({
          customerId: customer.id,
          phone,
          state: ATTENDANCE_STATE.WAITING_SCHEDULE,
          customerMessage: `Falha ao reservar ${data} ${normalizedPeriod}: ${reservation.reason}`,
          context,
        });
      }

      await this.tools.set_attendance_state({ customerId: customer.id, state: ATTENDANCE_STATE.CLOSED });
      return this.replyAndPersist({
        customerId: customer.id,
        phone,
        state: ATTENDANCE_STATE.CLOSED,
        customerMessage: `Reserva confirmada para ${data} (${normalizedPeriod}).`,
        context: { ...context, activeQuote: reservation.quote },
      });
    }

    return this.replyAndPersist({ customerId: customer.id, phone, state: attendance.estado, customerMessage: text, context });
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
      await this.tools.escalate_to_human({ customerId: analysisResult.customer.id, reason: 'Baixa confiança na análise da imagem' });
      return this.replyAndPersist({
        customerId: analysisResult.customer.id,
        phone,
        state: ATTENDANCE_STATE.HUMAN_HANDOFF,
        customerMessage: 'Imagem recebida e encaminhada para especialista.',
        context: { customer: analysisResult.customer, attendance: { estado: ATTENDANCE_STATE.HUMAN_HANDOFF, modo: ATTENDANCE_MODE.MANUAL }, activeQuote: quote, messages: [] },
      });
    }

    await this.tools.update_quote({ quoteId: quote.id, updates: { status: QUOTE_STATUS.APPROVED } });
    await this.tools.set_attendance_state({ customerId: analysisResult.customer.id, state: ATTENDANCE_STATE.WAITING_SCHEDULE });

    return this.replyAndPersist({
      customerId: analysisResult.customer.id,
      phone,
      state: ATTENDANCE_STATE.WAITING_SCHEDULE,
      customerMessage: `Análise concluída. Valor estimado ${quoteInference.estimatedValue ?? 'a confirmar'}.`,
      context: { customer: analysisResult.customer, attendance: { ...analysisResult.attendance, estado: ATTENDANCE_STATE.WAITING_SCHEDULE }, activeQuote: quote, messages: [] },
      quoteValue: quoteInference.estimatedValue,
    });
  }

  async replyAndPersist({ customerId, phone, state, customerMessage, context, quoteValue = null, needsPeriod = false }) {
    const contextPrompt = [
      `estado_atendimento: ${state}`,
      `modo_atendimento: ${context?.attendance?.modo || ATTENDANCE_MODE.AUTO}`,
      `objetivo_etapa: ${objectiveByState(state)}`,
      `houve_intervencao_humana: ${context?.attendance?.manual_motivo ? 'sim' : 'nao'}`,
      `orcamento_em_aberto: ${context?.activeQuote ? 'sim' : 'nao'}`,
      context?.activeQuote?.id ? `orcamento_id_atual: ${context.activeQuote.id}` : null,
      quoteValue ? `valor_estimado: ${quoteValue}` : null,
      needsPeriod ? 'dado_faltante: periodo (manha ou tarde)' : null,
      `historico_recente:\n${compactHistory(context?.messages).join('\n') || 'sem histórico relevante'}`,
      `mensagem_cliente: ${customerMessage}`,
      'Responda sem usar templates rígidos e sem repetir frases de espera.',
    ].filter(Boolean).join('\n');

    const ai = await generateAssistantReply({ systemPrompt: buildSystemPrompt(), contextPrompt });
    const message = ai.ok && ai.content ? ai.content : minimalFallback(state, needsPeriod);

    await this.tools.save_outgoing_message({ customerId, message });
    await this.tools.send_customer_message({ phone, message });

    return { replied: true, message, state };
  }
}
