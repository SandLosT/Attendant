import { ATTENDANCE_MODE, ATTENDANCE_STATE, QUOTE_STATUS } from '../../domain/constants/attendance.js';
import { inferQuoteFromImageAnalysis } from '../../domain/services/quoteDomainService.js';
import { parseDateAndPeriod, normalizePeriod } from '../../domain/services/scheduleDomainService.js';
import { shouldAutomationReply } from '../../domain/services/attendanceDomainService.js';
import { interpretUserTurn } from '../../domain/services/userMessageInterpreter.js';
import { buildConversationContext } from '../../services/ai/contextBuilder.js';
import { runToolCallingChat } from '../../services/ai/toolCallingChatService.js';

function baseSystemPrompt() {
  return [
    'Você é atendente de oficina automotiva.',
    'A prioridade de decisão é: mensagem atual do cliente > contexto acumulado > regras de negócio > modo > estado.',
    'Escreva em português do Brasil, com naturalidade profissional.',
    'Respostas curtas, claras e humanas; evite repetição e linguagem robótica.',
    'Faça uma pergunta por vez quando precisar coletar dados.',
    'Se o cliente não conseguir cumprir uma etapa, reconheça a limitação e ofereça alternativa prática sem insistência mecânica.',
    'Use tools quando precisar consultar/atualizar estado, orçamento e agenda.',
    'Nunca invente confirmação de reserva, valor fechado ou mudança de status sem tool.',
  ].join(' ');
}

function resolveNextAction({ attendance, interpretation }) {
  const [topMove] = interpretation.recommendedNextMoves;

  if (topMove === 'escalate_to_human') return { type: 'HUMAN_HANDOFF' };
  if (topMove === 'resume_automatic_flow') return { type: 'RESUME_AUTOMATION' };
  if (topMove === 'get_shop_info') return { type: 'ANSWER_TOPIC_SHIFT' };
  if (topMove === 'confirm_pause_or_cancellation') return { type: 'CANCELLATION_FLOW' };
  if (topMove === 'offer_non_committal_estimate') return { type: 'COMMERCIAL_OBJECTION_FLOW' };
  if (topMove === 'offer_operational_alternative') return { type: 'OPERATIONAL_OBJECTION_FLOW' };
  if (topMove === 'simplify_request') return { type: 'CONFUSION_FLOW' };

  if (interpretation.blockingConstraint?.kind === 'IMAGE_INPUT_UNAVAILABLE') return { type: 'IMAGE_ALTERNATIVE' };
  if (interpretation.blockingConstraint?.kind === 'SCHEDULE_INPUT_UNAVAILABLE') return { type: 'SCHEDULE_PENDING' };

  const parsed = interpretation.parsedSchedule;
  const weekDayMention = /(segunda|terca|quarta|quinta|sexta|sabado|domingo)/.test(interpretation.raw.normalizedText);
  const hasPeriod = Boolean(normalizePeriod(parsed.periodo));
  if (attendance?.estado === ATTENDANCE_STATE.WAITING_SCHEDULE && hasPeriod && !parsed.data && weekDayMention) {
    return { type: 'SCHEDULE_PARTIAL' };
  }

  return { type: 'AI_ORCHESTRATION' };
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
    'register_attendance_constraint',
    'get_shop_info',
    'register_conversation_signal',
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
  if (needsPeriod) return 'Perfeito, já peguei a data. Para esse dia, você prefere manhã ou tarde?';
  if (state === ATTENDANCE_STATE.HUMAN_HANDOFF) return 'Seu atendimento está com nosso especialista agora. Se quiser, eu registro mais detalhes para adiantar por aqui.';
  if (reason === 'MAX_TOOL_ROUNDS_REACHED') return 'Entendi você. Posso seguir por dois caminhos: tentar orçamento por descrição ou te encaminhar para especialista. O que prefere?';
  if (reason === 'MODEL_UNAVAILABLE') return 'Tive uma instabilidade agora, mas sigo com você. Me diz em uma frase se prefere orçamento por descrição ou falar com especialista.';
  if (reason === 'TOOL_ERROR') return 'Obrigado pela paciência. Não consegui concluir tudo automaticamente agora. Posso continuar por descrição ou encaminhar para especialista.';
  return 'Entendi seu ponto. Me diz o melhor próximo passo para você agora e eu sigo junto.';
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

    const interpretation = interpretUserTurn({ text, attendance });
    const nextAction = resolveNextAction({ attendance, interpretation });

    await this.mcpClient.callTool('register_conversation_signal', {
      customerId: customer.id,
      interpretation,
      sourceText: text,
      state: attendance.estado,
      mode: attendance.modo,
      nextBestGoal: interpretation.recommendedNextMoves[0],
    });

    const handled = await this.handleStructuredAction({ customer, attendance, phone, text, interpretation, nextAction });
    if (handled) return handled;

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
          message: minimalFallback(attendance.estado, 'generic', true),
        });
      }
    }

    const contextPrompt = buildConversationContext({
      context,
      customerMessage: text,
      interpretation,
      nextAction: nextAction.type,
    });

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

  async handleStructuredAction({ customer, attendance, phone, text, interpretation, nextAction }) {
    const handlers = {
      HUMAN_HANDOFF: async () => {
        await this.mcpClient.callTool('register_attendance_constraint', {
          customerId: customer.id,
          kind: 'HUMAN_REQUEST',
          detail: text,
          blockedStage: attendance.estado,
          handoffRequested: true,
          nextBestGoal: 'escalate_to_human',
        });
        await this.mcpClient.callTool('escalate_to_human', { customerId: customer.id, reason: 'Solicitação explícita do cliente' });
        return this.sendAndPersist({
          customerId: customer.id,
          phone,
          state: ATTENDANCE_STATE.HUMAN_HANDOFF,
          message: 'Perfeito, vou te encaminhar para um especialista humano agora. Se quiser, já deixo registrado o contexto para agilizar o atendimento.',
        });
      },
      RESUME_AUTOMATION: async () => {
        const resumed = await this.mcpClient.callTool('resume_automatic_flow', { customerId: customer.id });
        await this.mcpClient.callTool('register_attendance_constraint', {
          customerId: customer.id,
          kind: 'AUTO_RESUMED',
          detail: 'Cliente solicitou retorno do fluxo automático',
          blockedStage: attendance.estado,
          nextBestGoal: 'resume_automatic_flow',
        });
        return this.sendAndPersist({
          customerId: customer.id,
          phone,
          state: resumed.estado,
          message: 'Combinado, retomamos o fluxo automático. Me conta o que você consegue enviar agora para eu avançar sem te travar.',
        });
      },
      ANSWER_TOPIC_SHIFT: async () => {
        const shop = await this.mcpClient.callTool('get_shop_info', {});
        await this.mcpClient.callTool('register_attendance_constraint', {
          customerId: customer.id,
          kind: 'TOPIC_SHIFT',
          detail: text,
          blockedStage: attendance.estado,
          topicShift: interpretation.topicShift?.kind,
          nextBestGoal: 'return_to_main_flow_after_shop_info',
        });
        const address = shop?.endereco || 'Posso te confirmar o endereço com nosso especialista';
        const resumeHint = attendance.estado === ATTENDANCE_STATE.WAITING_IMAGE
          ? 'Quando puder, também pode me mandar uma descrição rápida do dano para eu seguir sem depender da foto.'
          : attendance.estado === ATTENDANCE_STATE.WAITING_SCHEDULE
            ? 'Quando quiser, me diz uma opção de data/período e eu continuo daqui.'
            : 'Se quiser, seguimos do ponto em que paramos.';

        return this.sendAndPersist({
          customerId: customer.id,
          phone,
          state: attendance.estado,
          message: `Nosso endereço é: ${address}. ${resumeHint}`,
        });
      },
      IMAGE_ALTERNATIVE: async () => {
        await this.mcpClient.callTool('register_attendance_constraint', {
          customerId: customer.id,
          kind: 'IMAGE_INPUT_UNAVAILABLE',
          detail: text,
          blockedStage: attendance.estado,
          pendingItems: ['imagem_do_dano'],
          alternatives: ['descricao_textual', 'especialista_humano'],
          missingRequiredInput: interpretation.missingRequiredInput,
          nextBestGoal: 'collect_damage_description',
        });
        return this.sendAndPersist({
          customerId: customer.id,
          phone,
          state: attendance.estado,
          message: 'Sem problema. Se você não consegue enviar foto agora, me descreve rapidinho o dano por texto e eu avanço por aqui. Se preferir, também posso te encaminhar para um especialista humano.',
        });
      },
      SCHEDULE_PENDING: async () => {
        await this.mcpClient.callTool('register_attendance_constraint', {
          customerId: customer.id,
          kind: 'SCHEDULE_UNDEFINED',
          detail: text,
          blockedStage: attendance.estado,
          pendingItems: ['data_e_periodo'],
          alternatives: ['registrar_pendencia_sem_pressao', 'especialista_humano'],
          missingRequiredInput: interpretation.missingRequiredInput,
          nextBestGoal: 'wait_customer_availability',
        });
        return this.sendAndPersist({
          customerId: customer.id,
          phone,
          state: attendance.estado,
          message: 'Tranquilo, sem pressa com a data. Posso deixar essa pendência registrada e, quando você definir o dia, eu encaixo o período rapidinho. Se preferir, te passo para um especialista seguir contigo.',
        });
      },
      SCHEDULE_PARTIAL: async () => {
        await this.mcpClient.callTool('register_attendance_constraint', {
          customerId: customer.id,
          kind: 'SCHEDULE_PARTIAL',
          detail: text,
          blockedStage: attendance.estado,
          pendingItems: ['data_exata'],
          nextBestGoal: 'collect_exact_date',
        });
        return this.sendAndPersist({
          customerId: customer.id,
          phone,
          state: attendance.estado,
          message: 'Perfeito, já considerei o período da manhã. Agora me passa só a data exata (dd/mm) para eu confirmar a agenda sem refazer a coleta toda.',
        });
      },
      COMMERCIAL_OBJECTION_FLOW: async () => {
        await this.mcpClient.callTool('register_attendance_constraint', {
          customerId: customer.id,
          kind: 'COMMERCIAL_OBJECTION',
          detail: text,
          blockedStage: attendance.estado,
          customerPreference: interpretation.customerPreference,
          nextBestGoal: 'offer_estimate_without_commitment',
        });
        return this.sendAndPersist({
          customerId: customer.id,
          phone,
          state: attendance.estado,
          message: 'Perfeito, sem compromisso. Posso te passar uma noção de valor por descrição e depois você decide com calma se quer seguir.',
        });
      },
      OPERATIONAL_OBJECTION_FLOW: async () => {
        await this.mcpClient.callTool('register_attendance_constraint', {
          customerId: customer.id,
          kind: 'OPERATIONAL_OBJECTION',
          detail: text,
          blockedStage: attendance.estado,
          urgency: interpretation.urgency,
          nextBestGoal: 'offer_operational_path',
        });
        return this.sendAndPersist({
          customerId: customer.id,
          phone,
          state: attendance.estado,
          message: 'Entendi seu cenário. A gente consegue adaptar: posso seguir por descrição agora e já priorizar o próximo horário viável para você.',
        });
      },
      CANCELLATION_FLOW: async () => {
        await this.mcpClient.callTool('register_attendance_constraint', {
          customerId: customer.id,
          kind: 'CANCELLATION_SIGNAL',
          detail: text,
          blockedStage: attendance.estado,
          nextBestGoal: 'confirm_cancellation_intent',
        });
        return this.sendAndPersist({
          customerId: customer.id,
          phone,
          state: attendance.estado,
          message: 'Tudo bem, posso pausar por aqui. Se preferir, eu já encerro agora — é só me confirmar com "pode encerrar".',
        });
      },
      CONFUSION_FLOW: async () => {
        await this.mcpClient.callTool('register_attendance_constraint', {
          customerId: customer.id,
          kind: 'CUSTOMER_CONFUSION',
          detail: text,
          blockedStage: attendance.estado,
          nextBestGoal: 'clarify_single_step',
        });
        return this.sendAndPersist({
          customerId: customer.id,
          phone,
          state: attendance.estado,
          message: 'Claro — te explico de forma simples. Agora eu só preciso de uma informação por vez para avançar sem te tomar tempo.',
        });
      },
    };

    const handler = handlers[nextAction.type];
    return handler ? handler() : null;
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
