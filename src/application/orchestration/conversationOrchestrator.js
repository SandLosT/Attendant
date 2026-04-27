import { ATTENDANCE_MODE, ATTENDANCE_STATE, QUOTE_STATUS } from '../../domain/constants/attendance.js';
import { inferQuoteFromImageAnalysis } from '../../domain/services/quoteDomainService.js';
import { parseDateAndPeriod, normalizePeriod } from '../../domain/services/scheduleDomainService.js';
import { shouldAutomationReply } from '../../domain/services/attendanceDomainService.js';
import { buildConversationContext } from '../../services/ai/contextBuilder.js';
import { runToolCallingChat } from '../../services/ai/toolCallingChatService.js';

function buildSystemPrompt() {
  return [
    'Você é atendente de oficina automotiva.',
    'Escreva em português do Brasil, com naturalidade profissional.',
    'Respostas curtas e claras; evite repetição e linguagem robótica.',
    'Faça uma pergunta por vez quando precisar coletar dados.',
    'Use tools quando precisar consultar/atualizar estado, orçamento e agenda.',
    'Nunca invente confirmação de reserva, valor fechado ou mudança de status sem tool.',
  ].join(' ');
}

function toolsByState(state) {
  const base = [
    'get_current_attendance',
    'get_customer_context',
    'set_attendance_state',
    'set_attendance_mode',
    'update_quote',
    'reserve_schedule_slot',
    'release_schedule_slot',
    'escalate_to_human',
    'resume_automatic_flow',
    'close_attendance',
  ];

  if (state === ATTENDANCE_STATE.WAITING_IMAGE) {
    return [...base, 'analyze_damage_image', 'create_quote_from_analysis'];
  }

  if (state === ATTENDANCE_STATE.WAITING_SCHEDULE) {
    return [...base, 'reserve_schedule_slot'];
  }

  return base;
}

function minimalFallback(state, needsPeriod = false) {
  if (needsPeriod) return 'Perfeito. Para essa data, você prefere manhã ou tarde?';
  if (state === ATTENDANCE_STATE.WAITING_IMAGE) return 'Consigo te ajudar melhor se você me enviar uma foto do dano.';
  if (state === ATTENDANCE_STATE.WAITING_SCHEDULE) return 'Me diga a data e o período (manhã ou tarde) para eu reservar.';
  if (state === ATTENDANCE_STATE.HUMAN_HANDOFF) return 'Seu atendimento está com nosso especialista humano neste momento.';
  return 'Entendi você. Me passa só mais um detalhe para eu avançar com segurança.';
}

export class ConversationOrchestrator {
  constructor({ mcpClient }) {
    this.mcpClient = mcpClient;
  }

  async handleIncomingText({ phone, text }) {
    const context = await this.mcpClient.callTool('get_customer_context', { phone });
    const customer = context.customer;
    const attendance = context.attendance;

    await this.mcpClient.callTool('save_incoming_message', { customerId: customer.id, message: text });

    if (!shouldAutomationReply(attendance) || attendance.modo === ATTENDANCE_MODE.MANUAL) {
      return { replied: false, reason: 'manual_mode' };
    }

    if (attendance.estado === ATTENDANCE_STATE.WAITING_SCHEDULE) {
      const parsed = parseDateAndPeriod(text);
      if (parsed.data && !normalizePeriod(parsed.periodo)) {
        return this.sendAndPersist({
          customerId: customer.id,
          phone,
          state: attendance.estado,
          message: minimalFallback(attendance.estado, true),
        });
      }
    }

    const contextPrompt = buildConversationContext({ context, customerMessage: text });

    let finalMessage = '';
    try {
      const toolCatalog = await this.mcpClient.listTools();
      const allowedNames = new Set(toolsByState(attendance.estado));
      const availableTools = toolCatalog.filter((tool) => allowedNames.has(tool.name));

      const aiResult = await runToolCallingChat({
        systemPrompt: buildSystemPrompt(),
        contextPrompt,
        availableTools,
        mcpClient: this.mcpClient,
      });
      finalMessage = aiResult.ok && aiResult.content ? aiResult.content : minimalFallback(attendance.estado);
    } catch {
      finalMessage = minimalFallback(attendance.estado);
    }

    return this.sendAndPersist({
      customerId: customer.id,
      phone,
      state: attendance.estado,
      message: finalMessage,
    });
  }

  async handleIncomingImage({ phone, base64, mimetype, filename }) {
    const analysisResult = await this.mcpClient.callTool('analyze_damage_image', { phone, base64, mimetype, filename });
    const quoteInference = inferQuoteFromImageAnalysis(analysisResult.analysis);

    const quote = await this.mcpClient.callTool('create_quote_from_analysis', {
      customerId: analysisResult.customer.id,
      imageId: analysisResult.imageId,
      quotePayload: quoteInference,
    });

    if (quoteInference.requiresHuman) {
      await this.mcpClient.callTool('escalate_to_human', {
        customerId: analysisResult.customer.id,
        reason: 'Baixa confiança na análise da imagem',
      });

      return this.sendAndPersist({
        customerId: analysisResult.customer.id,
        phone,
        state: ATTENDANCE_STATE.HUMAN_HANDOFF,
        message: 'Recebi a imagem. Vou passar para um especialista humano validar com você.',
      });
    }

    await this.mcpClient.callTool('update_quote', {
      quoteId: quote.id,
      updates: { status: QUOTE_STATUS.APPROVED },
    });
    await this.mcpClient.callTool('set_attendance_state', {
      customerId: analysisResult.customer.id,
      state: ATTENDANCE_STATE.WAITING_SCHEDULE,
    });

    return this.sendAndPersist({
      customerId: analysisResult.customer.id,
      phone,
      state: ATTENDANCE_STATE.WAITING_SCHEDULE,
      message: `Análise concluída. O valor estimado é R$ ${quoteInference.estimatedValue ?? 'a confirmar'}. Qual data e período você prefere?`,
    });
  }

  async sendAndPersist({ customerId, phone, state, message }) {
    await this.mcpClient.callTool('save_outgoing_message', { customerId, message });
    await this.mcpClient.callTool('send_customer_message', { phone, message });
    return { replied: true, state, message };
  }
}
