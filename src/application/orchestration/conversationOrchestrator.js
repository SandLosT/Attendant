import { ATTENDANCE_MODE, ATTENDANCE_STATE, QUOTE_STATUS } from '../../domain/constants/attendance.js';
import { inferQuoteFromImageAnalysis } from '../../domain/services/quoteDomainService.js';
import { parseDateAndPeriod, normalizePeriod } from '../../domain/services/scheduleDomainService.js';
import { shouldAutomationReply } from '../../domain/services/attendanceDomainService.js';
import { buildConversationContext } from '../../services/ai/contextBuilder.js';
import { runToolCallingChat } from '../../services/ai/toolCallingChatService.js';

function baseSystemPrompt() {
  return [
    'Você é atendente de oficina automotiva.',
    'Escreva em português do Brasil, com naturalidade profissional.',
    'Respostas curtas, claras e humanas; evite repetição e linguagem robótica.',
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

function minimalFallback(state, reason = 'generic', needsPeriod = false) {
  if (needsPeriod) return 'Perfeito. Para essa data, você prefere manhã ou tarde?';
  if (state === ATTENDANCE_STATE.WAITING_IMAGE) return 'Obrigado pelo retorno. Para avançar com segurança, me envie uma foto nítida do dano.';
  if (state === ATTENDANCE_STATE.WAITING_SCHEDULE) return 'Ótimo. Me diga a data e o período (manhã ou tarde) para eu verificar a agenda.';
  if (state === ATTENDANCE_STATE.HUMAN_HANDOFF) return 'Seu atendimento está com nosso especialista humano neste momento.';
  if (reason === 'MAX_TOOL_ROUNDS_REACHED') return 'Entendi. Vou simplificar: me confirme só o próximo passo que você prefere (orçamento ou agendamento).';
  if (reason === 'MODEL_UNAVAILABLE') return 'Estou com instabilidade agora, mas sigo com você. Me confirme em uma frase o que você precisa neste momento.';
  if (reason === 'TOOL_ERROR') return 'Obrigado pela paciência. Não consegui confirmar tudo automaticamente agora. Me diga se prefere seguir com orçamento ou falar com especialista.';
  return 'Entendi você. Me passa só mais um detalhe para eu avançar com segurança.';
}

async function buildSystemPrompt(mcpClient, attendanceState) {
  const promptName = attendanceState === ATTENDANCE_STATE.HUMAN_HANDOFF
    ? 'human_handoff_prompt'
    : attendanceState === ATTENDANCE_STATE.WAITING_SCHEDULE
      ? 'quote_followup_prompt'
      : 'customer_attendant_prompt';

  try {
    const prompt = await mcpClient.getPrompt(promptName);
    const remoteSystem = prompt?.messages?.find((m) => m.role === 'system')?.content || '';
    return `${baseSystemPrompt()} ${remoteSystem}`.trim();
  } catch {
    return baseSystemPrompt();
  }
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
        systemPrompt: await buildSystemPrompt(this.mcpClient, attendance.estado),
        contextPrompt,
        availableTools,
        mcpClient: this.mcpClient,
      });
      finalMessage = aiResult.ok && aiResult.content
        ? aiResult.content
        : minimalFallback(attendance.estado, aiResult.reason);
    } catch {
      finalMessage = minimalFallback(attendance.estado, 'MODEL_UNAVAILABLE');
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
