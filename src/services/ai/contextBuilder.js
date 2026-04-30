import { ATTENDANCE_MODE, ATTENDANCE_STATE } from '../../domain/constants/attendance.js';

function compactHistory(messages = []) {
  return messages
    .slice(-8)
    .map((message) => `${message.tipo === 'entrada' ? 'Cliente' : 'Atendente'}: ${message.mensagem}`)
    .join('\n');
}

function stageObjective(state) {
  if (state === ATTENDANCE_STATE.WAITING_IMAGE) return 'coletar evidências do dano (foto ou alternativa viável)';
  if (state === ATTENDANCE_STATE.IN_ANALYSIS) return 'aguardar análise da foto';
  if (state === ATTENDANCE_STATE.WAITING_SCHEDULE) return 'definir data e período com o mínimo de atrito';
  if (state === ATTENDANCE_STATE.HUMAN_HANDOFF) return 'informar que um humano assumiu';
  if (state === ATTENDANCE_STATE.CLOSED) return 'encerrar com confirmação curta';
  return 'entender o problema real do cliente e avançar com o próximo passo possível';
}

function stageStyle(state) {
  if (state === ATTENDANCE_STATE.HUMAN_HANDOFF) return 'acolhedor e transparente';
  if (state === ATTENDANCE_STATE.WAITING_SCHEDULE) return 'objetivo, sem pressionar o cliente';
  if (state === ATTENDANCE_STATE.WAITING_IMAGE) return 'didático e flexível, oferecendo alternativas à foto';
  return 'profissional, próximo e direto';
}

function summarizeSignals(signals = []) {
  if (!signals.length) return 'nenhum sinal operacional registrado recentemente';
  return signals
    .slice(-4)
    .map((signal) => `${signal.kind}${signal.detail ? ` (${signal.detail})` : ''}`)
    .join(', ');
}

export function buildConversationContext({ context, customerMessage, interpretation = null, nextAction = null }) {
  const customer = context?.customer || {};
  const attendance = context?.attendance || {};
  const quote = context?.activeQuote || null;

  const collected = [];
  if (quote?.valor_estimado) collected.push('valor estimado');
  if (quote?.slot_data && quote?.slot_periodo) collected.push('agendamento');
  if (context?.messages?.some((m) => m.tipo === 'entrada')) collected.push('histórico recente');

  const missing = [];
  if (!quote) missing.push('orçamento');
  if (quote && !quote.slot_data) missing.push('data/período');

  const operationalSignals = context?.operationalSignals || [];

  return [
    `Cliente: ${customer.nome || 'não informado'} (${customer.telefone || 'sem telefone'})`,
    `Mensagem atual tem prioridade sobre estado: sim`,
    `Estado do atendimento: ${attendance.estado || ATTENDANCE_STATE.OPEN}`,
    `Modo do atendimento: ${attendance.modo || ATTENDANCE_MODE.AUTO}`,
    `Orçamento atual: ${quote ? `#${quote.id} status=${quote.status}` : 'não existe'}`,
    `Agenda atual: ${quote?.slot_data ? `${quote.slot_data} (${quote.slot_periodo})` : 'não definida'}`,
    `Intervenção humana recente: ${attendance.manual_motivo ? `sim (${attendance.manual_motivo})` : 'não'}`,
    `Dados coletados: ${collected.length ? collected.join(', ') : 'nenhum relevante'}`,
    `Dados faltantes: ${missing.length ? missing.join(', ') : 'nenhum'}`,
    `Objetivo desta etapa: ${stageObjective(attendance.estado)}`,
    `Sinais operacionais recentes: ${summarizeSignals(operationalSignals)}`,
    `Interpretação estruturada da mensagem atual: ${interpretation ? JSON.stringify(interpretation) : 'nenhum sinal explícito'}`,
    `Próxima ação sugerida pela orquestração: ${nextAction || 'indefinida'}`,
    'Se insistir no que o cliente acabou de negar for inadequado, ofereça alternativa prática.',
    `Estilo recomendado: ${stageStyle(attendance.estado)}. Responda em até 3 frases curtas.`,
    `Histórico recente:\n${compactHistory(context?.messages) || 'Sem histórico relevante.'}`,
    `Mensagem atual do cliente: ${customerMessage}`,
  ].join('\n');
}
